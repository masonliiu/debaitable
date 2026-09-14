import { LlmProvider } from "../ai"
import {
  DecisionInput,
  DecisionRecord,
  DebateRound,
  DecisionRecordSchema,
  RoleDefinition,
  BadRequestError,
  parseDecisionRecord,
  sanitizeDecisionInput,
} from "../core"
import { assertValidRoles } from "./guards"
import {
  buildConvergencePrompt,
  buildCritiquePrompt,
  buildDecisionRecordPrompt,
  buildProposalPrompt,
} from "./prompts"
import {
  ConvergenceOutputSchema,
  CritiqueOutputSchema,
  ProposalOutputSchema,
} from "./schemas"
import {
  serializeConvergenceOutput,
  serializeCritiqueOutput,
  serializeProposalOutput,
} from "./serialize"
import { ConsensusStrategy, ConvergenceOutput, CritiqueOutput, PartialFailure, ProposalOutput, RoleProviderMap, RunStatus } from "./types"
import {
  parseConvergenceOutput,
  parseCritiqueOutput,
  parseProposalOutput,
} from "./validate"
import {
  normalizeConvergenceOutput,
  normalizeCritiqueOutput,
  normalizeDecisionRecordOutput,
  normalizeProposalOutput,
} from "./normalize"
import { synthesizeDecisionRecord } from "./synthesize"
import { assertDecisionRecordQuality } from "./quality"

export type LlmCallResult<TOutput> = {
  output: TOutput
  raw: string
  model: string
}

export type DebateRun = {
  input: DecisionInput
  proposals: LlmCallResult<ProposalOutput>[]
  critiques: LlmCallResult<CritiqueOutput>[]
  convergence: LlmCallResult<ConvergenceOutput>[]
  decisionRecord: LlmCallResult<DecisionRecord>
  rounds: DebateRound[]
  status: RunStatus
  failures: PartialFailure[]
  consensusStrategy: ConsensusStrategy
}

type RoundContext = {
  input: DecisionInput
  roles: RoleDefinition[]
  provider: LlmProvider
  providerMap?: RoleProviderMap
}

const resolveProvider = (
  role: RoleDefinition,
  defaultProvider: LlmProvider,
  providerMap?: RoleProviderMap
): LlmProvider => (providerMap && providerMap[role.key]) ?? defaultProvider

const ensureRoleKey = (expected: string, actual: string): void => {
  if (expected !== actual) {
    throw new BadRequestError(
      `Role key mismatch: expected ${expected}, got ${actual}`
    )
  }
}

const BUSINESS_JARGON = [
  "kpi",
  "sla",
  "rollout",
  "pilot",
  "canary",
  "funnel",
  "activation",
  "sponsor rev",
  "market share",
  "go to market",
]

const countMatches = (text: string, terms: string[]): number =>
  terms.reduce((count, term) => (text.includes(term) ? count + 1 : count), 0)

const isLikelyOffTopic = (input: DecisionInput, output: DecisionRecord): boolean => {
  if (input.decisionType !== "general") {
    return false
  }
  const subjectText = `${input.title} ${input.context} ${input.goals.join(" ")} ${input.constraints.join(" ")}`
    .toLowerCase()
  const outputText = [
    output.summary,
    output.rationale,
    output.executiveDecision.stopGoCriteria,
    ...output.executiveDecision.why,
    ...output.actions,
  ]
    .join(" ")
    .toLowerCase()
  const outputJargon = countMatches(outputText, BUSINESS_JARGON)
  const subjectJargon = countMatches(subjectText, BUSINESS_JARGON)
  return outputJargon >= 2 && subjectJargon === 0
}

const providerIdentity = (role: RoleDefinition, provider: LlmProvider): { provider: string; model: string } => {
  const anyProvider = provider as unknown as { name?: string; model?: string; providerName?: string }
  const raw = provider as unknown as { constructor?: { name?: string } }
  const providerName =
    (typeof anyProvider.providerName === "string" && anyProvider.providerName) ||
    (typeof anyProvider.name === "string" && anyProvider.name) ||
    raw.constructor?.name ||
    "provider"
  const model = typeof anyProvider.model === "string" ? anyProvider.model : "unknown"
  void role
  return { provider: providerName, model }
}

const classifyError = (err: unknown): PartialFailure["kind"] => {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  const lowered = message.toLowerCase()
  if (lowered.includes("unauthorized") || lowered.includes("auth") || lowered.includes("401") || lowered.includes("403") || lowered.includes("api key")) {
    return "auth"
  }
  if (lowered.includes("timeout") || lowered.includes("timed out") || lowered.includes("etimedout") || lowered.includes("abort")) {
    return "timeout"
  }
  return "malformed"
}

const retryCountOf = (provider: LlmProvider): number => {
  const anyProvider = provider as unknown as {
    maxRetries?: unknown
    maxAttempts?: unknown
    retries?: unknown
  }
  if (typeof anyProvider.maxRetries === "number") return anyProvider.maxRetries
  if (typeof anyProvider.maxAttempts === "number") return Math.max(0, anyProvider.maxAttempts - 1)
  if (typeof anyProvider.retries === "number") return anyProvider.retries
  return 0
}

type RoleSuccess<TOutput> = { ok: true; result: LlmCallResult<TOutput> }
type RoleFailure = { ok: false; failure: PartialFailure }

const runOneRole = async <TOutput>(
  role: RoleDefinition,
  roleProvider: LlmProvider,
  attempt: () => Promise<LlmCallResult<TOutput>>
): Promise<RoleSuccess<TOutput> | RoleFailure> => {
  try {
    const result = await attempt()
    return { ok: true, result }
  } catch (err) {
    const identity = providerIdentity(role, roleProvider)
    return {
      ok: false,
      failure: {
        roleKey: role.key,
        provider: identity.provider,
        model: identity.model,
        kind: classifyError(err),
        retryCount: retryCountOf(roleProvider),
        // A role that is omitted after an unrecovered failure did not receive
        // a fallback answer. FallbackProvider wrappers can opt in explicitly
        // with a runtime `fallbackUsed` flag when they preserve a role output.
        fallbackUsed:
          (roleProvider as unknown as { fallbackUsed?: unknown }).fallbackUsed === true,
        // Keep only a bounded, single-line diagnostic. The full prompt/output
        // is intentionally never persisted in a failure record.
        message: (err instanceof Error ? err.message : String(err))
          .replace(/[\r\n]+/g, " ")
          .slice(0, 240),
      },
    }
  }
}

const partitionSettled = <TOutput>(settled: (RoleSuccess<TOutput> | RoleFailure)[]): { results: LlmCallResult<TOutput>[]; failures: PartialFailure[] } => {
  const results: LlmCallResult<TOutput>[] = []
  const failures: PartialFailure[] = []
  for (const item of settled) {
    if (item.ok) results.push(item.result)
    else failures.push(item.failure)
  }
  return { results, failures }
}

const runProposals = async ({ input, roles, provider, providerMap }: RoundContext) => {
  const settled = await Promise.all(
    roles.map(async (role) => {
      const roleProvider = resolveProvider(role, provider, providerMap)
      return runOneRole<ProposalOutput>(role, roleProvider, async () => {
        const { system, prompt } = buildProposalPrompt(role, input)
        const response = await roleProvider.generate({
          system,
          prompt,
          schema: ProposalOutputSchema,
        })
        const output = normalizeProposalOutput(parseProposalOutput(response.output))
        ensureRoleKey(role.key, output.roleKey)
        return { ...response, output }
      })
    })
  )
  const { results, failures } = partitionSettled(settled)
  if (results.length === 0) {
    const detail = failures.at(-1)?.message
    throw new BadRequestError(
      `All role providers failed during proposals${detail ? `: ${detail}` : ""}`,
    )
  }
  return { proposals: results, failures }
}

const runCritiques = async (
  { input, roles, provider, providerMap }: RoundContext,
  proposals: ProposalOutput[],
  survivingRoles: RoleDefinition[]
) => {
  const settled = await Promise.all(
    survivingRoles.map(async (role) => {
      const roleProvider = resolveProvider(role, provider, providerMap)
      return runOneRole<CritiqueOutput>(role, roleProvider, async () => {
        const { system, prompt } = buildCritiquePrompt(role, input, proposals)
        const response = await roleProvider.generate({
          system,
          prompt,
          schema: CritiqueOutputSchema,
        })
        const output = normalizeCritiqueOutput(parseCritiqueOutput(response.output))
        ensureRoleKey(role.key, output.roleKey)
        return { ...response, output }
      })
    })
  )
  const { results, failures } = partitionSettled(settled)
  if (results.length === 0) {
    const detail = failures.at(-1)?.message
    throw new BadRequestError(
      `All role providers failed during critiques${detail ? `: ${detail}` : ""}`,
    )
  }
  return { critiques: results, failures }
}

const runConvergence = async (
  { input, roles, provider, providerMap }: RoundContext,
  proposals: ProposalOutput[],
  critiques: CritiqueOutput[],
  survivingRoles: RoleDefinition[]
) => {
  const settled = await Promise.all(
    survivingRoles.map(async (role) => {
      const roleProvider = resolveProvider(role, provider, providerMap)
      return runOneRole<ConvergenceOutput>(role, roleProvider, async () => {
        const { system, prompt } = buildConvergencePrompt(role, input, proposals, critiques)
        const response = await roleProvider.generate({
          system,
          prompt,
          schema: ConvergenceOutputSchema,
        })
        const output = normalizeConvergenceOutput(parseConvergenceOutput(response.output))
        ensureRoleKey(role.key, output.roleKey)
        return { ...response, output }
      })
    })
  )
  const { results, failures } = partitionSettled(settled)
  if (results.length === 0) {
    const detail = failures.at(-1)?.message
    throw new BadRequestError(
      `All role providers failed during convergence${detail ? `: ${detail}` : ""}`,
    )
  }
  return { convergence: results, failures }
}

const runDecisionRecord = async (
  provider: LlmProvider,
  input: DecisionInput,
  proposals: ProposalOutput[],
  critiques: CritiqueOutput[],
  convergence: ConvergenceOutput[],
  consensusStrategy: ConsensusStrategy
) => {
  const fallback = normalizeDecisionRecordOutput(
    synthesizeDecisionRecord(input, proposals, critiques, convergence, consensusStrategy)
  )
  assertDecisionRecordQuality(fallback)
  try {
    const { system, prompt } = buildDecisionRecordPrompt(
      input,
      proposals,
      critiques,
      convergence
    )
    const response = await provider.generate({
      system,
      prompt,
      schema: DecisionRecordSchema,
    })
    const generated = normalizeDecisionRecordOutput(
      parseDecisionRecord(response.output)
    )
    const output = { ...generated, confidence: fallback.confidence,
      minorityReport: fallback.minorityReport,
      executiveDecision: { ...generated.executiveDecision,
        decision: fallback.executiveDecision.decision } }
    assertDecisionRecordQuality(output)
    if (isLikelyOffTopic(input, output)) {
      throw new BadRequestError("Decision record relevance: output drifted from the input subject")
    }
    return { ...response, output }
  } catch {
    return {
      output: fallback,
      raw: JSON.stringify(fallback),
      model: "deterministic-synth",
    }
  }
}

const buildDebateRounds = (
  proposals: LlmCallResult<ProposalOutput>[],
  critiques: LlmCallResult<CritiqueOutput>[],
  convergence: LlmCallResult<ConvergenceOutput>[]
): DebateRound[] => {
  const proposalRounds = proposals.map((proposal) => ({
    roundIndex: 1,
    roleKey: proposal.output.roleKey,
    model: proposal.model,
    output: serializeProposalOutput(proposal.output),
  }))
  const critiqueRounds = critiques.map((critique) => ({
    roundIndex: 2,
    roleKey: critique.output.roleKey,
    model: critique.model,
    output: serializeCritiqueOutput(critique.output),
  }))
  const convergenceRounds = convergence.map((converged) => ({
    roundIndex: 3,
    roleKey: converged.output.roleKey,
    model: converged.model,
    output: serializeConvergenceOutput(converged.output),
  }))
  return [...proposalRounds, ...critiqueRounds, ...convergenceRounds]
}

export type RunDebateOptions = {
  input: DecisionInput
  roles: RoleDefinition[]
  provider: LlmProvider
  providerMap?: RoleProviderMap
  consensusStrategy?: ConsensusStrategy
}

export const runDebate = async ({
  input,
  roles,
  provider,
  providerMap,
  consensusStrategy = "equal",
}: RunDebateOptions): Promise<DebateRun> => {
  assertValidRoles(roles)
  const sanitizedInput = sanitizeDecisionInput(input)
  const failures: PartialFailure[] = []
  const proposalStep = await runProposals({
    input: sanitizedInput,
    roles,
    provider,
    providerMap,
  })
  failures.push(...proposalStep.failures)
  const proposals = proposalStep.proposals
  const proposalOutputs = proposals.map((item) => item.output)
  const failedProposalKeys = new Set(proposalStep.failures.map((f) => f.roleKey))
  const afterProposalRoles = roles.filter((r) => !failedProposalKeys.has(r.key))
  const critiqueStep = await runCritiques(
    { input: sanitizedInput, roles, provider, providerMap },
    proposalOutputs,
    afterProposalRoles
  )
  failures.push(...critiqueStep.failures)
  const critiques = critiqueStep.critiques
  const critiqueOutputs = critiques.map((item) => item.output)
  const failedCritiqueKeys = new Set(critiqueStep.failures.map((f) => f.roleKey))
  const afterCritiqueRoles = afterProposalRoles.filter((r) => !failedCritiqueKeys.has(r.key))
  const convergenceStep = await runConvergence(
    { input: sanitizedInput, roles, provider, providerMap },
    proposalOutputs,
    critiqueOutputs,
    afterCritiqueRoles
  )
  failures.push(...convergenceStep.failures)
  const convergence = convergenceStep.convergence
  const convergenceOutputs = convergence.map((item) => item.output)
  const decisionRecord = await runDecisionRecord(
    provider,
    sanitizedInput,
    proposalOutputs,
    critiqueOutputs,
    convergenceOutputs,
    consensusStrategy
  )
  const rounds = buildDebateRounds(proposals, critiques, convergence)
  const status: RunStatus = failures.length > 0 ? "degraded" : "ok"
  return {
    input: sanitizedInput,
    proposals,
    critiques,
    convergence,
    decisionRecord,
    rounds,
    status,
    failures,
    consensusStrategy,
  }
}
