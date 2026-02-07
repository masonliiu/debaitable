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
import { ConvergenceOutput, CritiqueOutput, ProposalOutput } from "./types"
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
}

type RoundContext = {
  input: DecisionInput
  roles: RoleDefinition[]
  provider: LlmProvider
}

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

const runProposals = async ({ input, roles, provider }: RoundContext) =>
  Promise.all(
    roles.map(async (role) => {
      const { system, prompt } = buildProposalPrompt(role, input)
      const response = await provider.generate({
        system,
        prompt,
        schema: ProposalOutputSchema,
      })
      const output = normalizeProposalOutput(parseProposalOutput(response.output))
      ensureRoleKey(role.key, output.roleKey)
      return { ...response, output }
    })
  )

const runCritiques = async (
  { input, roles, provider }: RoundContext,
  proposals: ProposalOutput[]
) =>
  Promise.all(
    roles.map(async (role) => {
      const { system, prompt } = buildCritiquePrompt(role, input, proposals)
      const response = await provider.generate({
        system,
        prompt,
        schema: CritiqueOutputSchema,
      })
      const output = normalizeCritiqueOutput(parseCritiqueOutput(response.output))
      ensureRoleKey(role.key, output.roleKey)
      return { ...response, output }
    })
  )

const runConvergence = async (
  { input, roles, provider }: RoundContext,
  proposals: ProposalOutput[],
  critiques: CritiqueOutput[]
) =>
  Promise.all(
    roles.map(async (role) => {
      const { system, prompt } = buildConvergencePrompt(
        role,
        input,
        proposals,
        critiques
      )
      const response = await provider.generate({
        system,
        prompt,
        schema: ConvergenceOutputSchema,
      })
      const output = normalizeConvergenceOutput(
        parseConvergenceOutput(response.output)
      )
      ensureRoleKey(role.key, output.roleKey)
      return { ...response, output }
    })
  )

const runDecisionRecord = async (
  provider: LlmProvider,
  input: DecisionInput,
  proposals: ProposalOutput[],
  critiques: CritiqueOutput[],
  convergence: ConvergenceOutput[]
) => {
  const fallback = normalizeDecisionRecordOutput(
    synthesizeDecisionRecord(input, proposals, critiques, convergence)
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
    const output = normalizeDecisionRecordOutput(
      parseDecisionRecord(response.output)
    )
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
    output: serializeProposalOutput(proposal.output),
  }))
  const critiqueRounds = critiques.map((critique) => ({
    roundIndex: 2,
    roleKey: critique.output.roleKey,
    output: serializeCritiqueOutput(critique.output),
  }))
  const convergenceRounds = convergence.map((converged) => ({
    roundIndex: 3,
    roleKey: converged.output.roleKey,
    output: serializeConvergenceOutput(converged.output),
  }))
  return [...proposalRounds, ...critiqueRounds, ...convergenceRounds]
}

export const runDebate = async ({
  input,
  roles,
  provider,
}: RoundContext): Promise<DebateRun> => {
  assertValidRoles(roles)
  const sanitizedInput = sanitizeDecisionInput(input)
  const proposals = await runProposals({
    input: sanitizedInput,
    roles,
    provider,
  })
  const proposalOutputs = proposals.map((proposal) => proposal.output)
  const critiques = await runCritiques(
    { input: sanitizedInput, roles, provider },
    proposalOutputs
  )
  const critiqueOutputs = critiques.map((critique) => critique.output)
  const convergence = await runConvergence(
    { input: sanitizedInput, roles, provider },
    proposalOutputs,
    critiqueOutputs
  )
  const convergenceOutputs = convergence.map((result) => result.output)
  const decisionRecord = await runDecisionRecord(
    provider,
    sanitizedInput,
    proposalOutputs,
    critiqueOutputs,
    convergenceOutputs
  )
  const rounds = buildDebateRounds(proposals, critiques, convergence)
  return {
    input: sanitizedInput,
    proposals,
    critiques,
    convergence,
    decisionRecord,
    rounds,
  }
}
