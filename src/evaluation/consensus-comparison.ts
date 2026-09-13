/**
 * Reproducible single-model versus consensus evaluation.
 *
 * This module deliberately defaults to the deterministic heuristic provider. It
 * gives DebAItable a cheap, offline smoke benchmark while preserving the exact
 * model identity, votes, confidence, dissent, and failure information that a
 * live provider evaluation would need. It is a comparison harness, not an
 * accuracy claim.
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { HeuristicDebateProvider } from "../ai/heuristic-provider"
import { DecisionInput, DecisionRecord, DecisionRecordSchema, RoleDefinition } from "../core"
import { roleDefinitions } from "../core/roles"
import { buildComparisonArtifact } from "../orchestration/comparison"
import { ConsensusStrategy, DebateRun, RoleComparison } from "../orchestration"
import { runDebate } from "../orchestration/run"

export type EvaluationScenario = {
  id: string
  input: DecisionInput
}

export type IndividualEvaluation = {
  roleKey: string
  model: string
  ok: boolean
  decision?: string
  confidence?: number | null
  summary?: string
  error?: string
}

export type ConsensusRoleEvidence = {
  roleKey: string
  model: string
  vote: string
  confidence?: number | null
  agreements: string[]
  disagreements: string[]
}

export type StrategyEvaluation = {
  strategy: ConsensusStrategy
  ok: boolean
  modelIdentities: string[]
  consensusDecision?: string
  consensusConfidence?: number
  minorityReport?: string
  roles: ConsensusRoleEvidence[]
  agreements: number
  disagreements: number
  comparisonToIndividualMode: "win" | "tie" | "loss"
  error?: string
}

export type ScenarioComparison = {
  scenarioId: string
  title: string
  input: DecisionInput
  individuals: IndividualEvaluation[]
  individualMode?: string
  strategies: StrategyEvaluation[]
  partialFailures: string[]
}

export type WinTieLoss = { win: number; tie: number; loss: number }

export type EvaluationReport = {
  schemaVersion: 1
  provider: "heuristic"
  scenarios: ScenarioComparison[]
  aggregate: Record<ConsensusStrategy, WinTieLoss>
}

export const EVALUATION_SCENARIOS: EvaluationScenario[] = [
  {
    id: "scenario-product-mvp",
    input: {
      title: "Launch a mobile app MVP",
      context: "Should we launch a mobile app MVP within 60 days?",
      goals: ["Capture early adopters", "Validate product-market fit"],
      constraints: ["Limited engineering resources", "Q4 budget freeze"],
      decisionType: "product",
    },
  },
  {
    id: "scenario-engineering-migration",
    input: {
      title: "Migrate a monolith to microservices",
      context: "Should we migrate our monolith to microservices this quarter?",
      goals: ["Improve scalability", "Enable independent deployments"],
      constraints: ["Zero downtime required", "Team of five engineers"],
      decisionType: "engineering",
    },
  },
  {
    id: "scenario-hiring-offshore",
    input: {
      title: "Hire an offshore engineering team",
      context: "Is hiring an offshore engineering team the right choice?",
      goals: ["Reduce cost", "Scale capacity rapidly"],
      constraints: ["At least four hours of timezone overlap", "IP protection requirements"],
      decisionType: "hiring",
    },
  },
  {
    id: "scenario-api-build-buy",
    input: {
      title: "Build or buy an observability API",
      context: "Should we build an observability API in-house or buy a managed service?",
      goals: ["Ship reliable dashboards quickly", "Control long-term operating cost"],
      constraints: ["Two engineers available", "Existing customer data must remain private"],
      decisionType: "product",
    },
  },
  {
    id: "scenario-security-rotation",
    input: {
      title: "Rotate credentials after a suspected leak",
      context: "Should we immediately rotate production credentials after a suspected leak?",
      goals: ["Contain unauthorized access", "Preserve service availability"],
      constraints: ["Incident evidence is incomplete", "A maintenance window is unavailable"],
      decisionType: "engineering",
    },
  },
]

const roleName = (role: RoleDefinition): string => role.key

const normalize = (value: string | undefined): string =>
  (value ?? "unknown").trim().toLowerCase()

export const extractDecision = (record: DecisionRecord): string =>
  record.executiveDecision.decision

const extractModel = (run: DebateRun, role: RoleDefinition): string =>
  run.convergence.find((item) => item.output.roleKey === role.key)?.model
  ?? run.proposals.find((item) => item.output.roleKey === role.key)?.model
  ?? "unknown"

const confidenceForRole = (run: DebateRun, role: RoleDefinition): number | undefined =>
  run.convergence.find((item) => item.output.roleKey === role.key)?.output.confidence

const safeSummary = (record: DecisionRecord): string => record.summary.slice(0, 500)

const runSingleRole = async (
  scenario: EvaluationScenario,
  role: RoleDefinition,
): Promise<IndividualEvaluation> => {
  const provider = new HeuristicDebateProvider()
  try {
    const run = await runDebate({
      input: scenario.input,
      roles: [role],
      provider,
      consensusStrategy: "equal",
    })
    const parsed = DecisionRecordSchema.safeParse(run.decisionRecord.output)
    if (!parsed.success) {
      return { roleKey: roleName(role), model: extractModel(run, role), ok: false, error: "schema validation failed" }
    }
    return {
      roleKey: roleName(role),
      model: extractModel(run, role),
      ok: true,
      decision: extractDecision(parsed.data),
      confidence: confidenceForRole(run, role) ?? null,
      summary: safeSummary(parsed.data),
    }
  } catch (error) {
    return {
      roleKey: roleName(role),
      model: "unknown",
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 500) : "unknown failure",
    }
  }
}

const toRoleEvidence = (role: RoleComparison): ConsensusRoleEvidence => ({
  roleKey: role.roleKey,
  model: role.model,
  vote: role.vote,
  confidence: role.confidence ?? null,
  agreements: role.agreements.slice(0, 3),
  disagreements: role.disagreements.slice(0, 3),
})

const modeOf = (values: string[]): string | undefined => {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0 || (ranked[1] && ranked[0][1] === ranked[1][1])) return undefined
  return ranked[0][0]
}

const runConsensus = async (
  scenario: EvaluationScenario,
  strategy: ConsensusStrategy,
  roles: RoleDefinition[],
): Promise<StrategyEvaluation> => {
  try {
    const run = await runDebate({
      input: scenario.input,
      roles,
      provider: new HeuristicDebateProvider(),
      consensusStrategy: strategy,
    })
    const parsed = DecisionRecordSchema.safeParse(run.decisionRecord.output)
    if (!parsed.success) {
      return {
        strategy,
        ok: false,
        modelIdentities: run.convergence.map((item) => item.model),
        roles: [],
        agreements: 0,
        disagreements: 0,
        comparisonToIndividualMode: "tie",
        error: "schema validation failed",
      }
    }
    const artifact = buildComparisonArtifact(run)
    const evidence = artifact.roles.map(toRoleEvidence)
    return {
      strategy,
      ok: true,
      modelIdentities: [...new Set(evidence.map((item) => item.model))],
      consensusDecision: extractDecision(parsed.data),
      consensusConfidence: parsed.data.confidence,
      minorityReport: parsed.data.minorityReport,
      roles: evidence,
      agreements: 0,
      disagreements: 0,
      comparisonToIndividualMode: "tie",
    }
  } catch (error) {
    return {
      strategy,
      ok: false,
      modelIdentities: [],
      roles: [],
      agreements: 0,
      disagreements: 0,
      comparisonToIndividualMode: "tie",
      error: error instanceof Error ? error.message.slice(0, 500) : "unknown failure",
    }
  }
}

export const compareConsensusToIndividuals = (
  result: StrategyEvaluation,
  individuals: IndividualEvaluation[],
): StrategyEvaluation => {
  const answers = individuals.filter((item) => item.ok && item.decision)
  const consensus = normalize(result.consensusDecision)
  const individualDecisions = answers.map((item) => normalize(item.decision))
  const mode = modeOf(individualDecisions)
  let agreements = 0
  for (const answer of individualDecisions) {
    if (answer === consensus) agreements += 1
  }
  const disagreements = Math.max(0, individualDecisions.length - agreements)
  return {
    ...result,
    agreements,
    disagreements,
    comparisonToIndividualMode: !result.ok || !mode
      ? "tie"
      : consensus === mode ? "win" : "loss",
  }
}

export async function evaluateScenario(
  scenario: EvaluationScenario,
  strategies: ConsensusStrategy[] = ["equal", "confidence-weighted"],
  roles: RoleDefinition[] = roleDefinitions,
): Promise<ScenarioComparison> {
  const individuals: IndividualEvaluation[] = []
  for (const role of roles) individuals.push(await runSingleRole(scenario, role))
  const individualMode = modeOf(
    individuals.filter((item) => item.ok && item.decision).map((item) => normalize(item.decision)),
  )
  const partialFailures = individuals
    .filter((item) => !item.ok)
    .map((item) => `${item.roleKey}: ${item.error ?? "failed"}`)
  const strategyResults: StrategyEvaluation[] = []
  for (const strategy of strategies) {
    const result = compareConsensusToIndividuals(await runConsensus(scenario, strategy, roles), individuals)
    strategyResults.push(result)
    if (result.error) partialFailures.push(`${strategy}: ${result.error}`)
  }
  return {
    scenarioId: scenario.id,
    title: scenario.input.title,
    input: scenario.input,
    individuals,
    individualMode,
    strategies: strategyResults,
    partialFailures,
  }
}

export async function runEvaluationReport(
  scenarios: EvaluationScenario[] = EVALUATION_SCENARIOS,
  strategies: ConsensusStrategy[] = ["equal", "confidence-weighted"],
): Promise<EvaluationReport> {
  const normalizedStrategies = [...new Set(strategies)]
  const results: ScenarioComparison[] = []
  for (const scenario of scenarios) {
    results.push(await evaluateScenario(scenario, normalizedStrategies))
  }
  const aggregate: Record<ConsensusStrategy, WinTieLoss> = {
    equal: { win: 0, tie: 0, loss: 0 },
    "confidence-weighted": { win: 0, tie: 0, loss: 0 },
  }
  for (const scenario of results) {
    for (const strategy of scenario.strategies) {
      aggregate[strategy.strategy][strategy.comparisonToIndividualMode] += 1
    }
  }
  return { schemaVersion: 1, provider: "heuristic", scenarios: results, aggregate }
}

const markdownCell = (value: string): string =>
  value.replaceAll("|", "\\|").replaceAll("\n", " ").slice(0, 240)

export function evaluationReportToMarkdown(report: EvaluationReport): string {
  const lines = [
    "# DebAItable Consensus Comparison",
    "",
    "This is a deterministic, heuristic-only comparison harness. `win` means the consensus label matches the unique modal single-role label; `tie` means no unique mode or an unavailable run; `loss` means it differs. These are agreement signals, not accuracy claims.",
    "",
    `Scenarios: ${report.scenarios.length} | Provider: ${report.provider} | Strategies: ${Object.keys(report.aggregate).join(", ")}`,
    "",
    "## Aggregate comparison",
    "",
    "| strategy | win (matches individual mode) | tie | loss |",
    "| --- | ---: | ---: | ---: |",
  ]
  for (const [strategy, counts] of Object.entries(report.aggregate)) {
    lines.push(`| ${strategy} | ${counts.win} | ${counts.tie} | ${counts.loss} |`)
  }
  for (const scenario of report.scenarios) {
    lines.push("", `## ${scenario.scenarioId} — ${scenario.title}`, "")
    lines.push(`**Prompt:** ${markdownCell(scenario.input.context)}`)
    lines.push(`**Individual mode:** \`${scenario.individualMode ?? "tie / unavailable"}\``)
    if (scenario.partialFailures.length) {
      lines.push(`**Partial failures:** ${scenario.partialFailures.map(markdownCell).join("; ")}`)
    }
    lines.push("", "### Single-role answers", "", "| role | model | ok | decision | confidence |", "| --- | --- | --- | --- | ---: |")
    for (const individual of scenario.individuals) {
      lines.push(`| ${individual.roleKey} | ${markdownCell(individual.model)} | ${individual.ok ? "yes" : "no"} | \`${markdownCell(individual.decision ?? individual.error ?? "n/a")}\` | ${individual.confidence ?? "—"} |`)
    }
    for (const result of scenario.strategies) {
      lines.push("", `### ${result.strategy} consensus`, "")
      lines.push(`- Decision: \`${result.consensusDecision ?? "unavailable"}\``)
      lines.push(`- Comparison to individual mode: **${result.comparisonToIndividualMode}** (${result.agreements} agree / ${result.disagreements} disagree)`)
      lines.push(`- Model identities: ${result.modelIdentities.map(markdownCell).join(", ") || "none"}`)
      lines.push(`- Minority report: ${markdownCell(result.minorityReport ?? result.error ?? "unavailable")}`)
      lines.push("", "| role | model | vote | confidence | dissent / conditions |", "| --- | --- | --- | ---: | --- |")
      for (const role of result.roles) {
        const dissent = [...role.disagreements, ...role.agreements].slice(0, 2).join("; ") || "—"
        lines.push(`| ${role.roleKey} | ${markdownCell(role.model)} | ${role.vote} | ${role.confidence ?? "—"} | ${markdownCell(dissent)} |`)
      }
    }
  }
  lines.push("", "## Reproduction and limits", "", "```bash", "npm run eval-compare", "```", "", "Read [docs/limitations.md](limitations.md) before interpreting any comparison as evidence of decision quality.", "")
  return lines.join("\n")
}

export const toMarkdownReport = evaluationReportToMarkdown

export async function writeEvaluationReport(
  report: EvaluationReport,
  markdownPath = "docs/evaluation.md",
  jsonPath = "artifacts/evaluation-report.json",
): Promise<void> {
  await mkdir(path.dirname(markdownPath), { recursive: true })
  await mkdir(path.dirname(jsonPath), { recursive: true })
  await writeFile(markdownPath, `${evaluationReportToMarkdown(report)}\n`, "utf8")
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
}

export type EvaluationCliOptions = {
  strategies: ConsensusStrategy[]
  markdownPath: string
  jsonPath: string
}

export function parseEvaluationArgs(argv: string[]): EvaluationCliOptions {
  const options: EvaluationCliOptions = {
    strategies: ["equal", "confidence-weighted"],
    markdownPath: "docs/evaluation.md",
    jsonPath: "artifacts/evaluation-report.json",
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--strategy") {
      const value = argv[++index]
      if (value === "both") options.strategies = ["equal", "confidence-weighted"]
      else if (value === "equal" || value === "confidence-weighted") options.strategies = [value]
      else throw new Error("--strategy must be equal, confidence-weighted, or both")
    } else if (arg === "--out" || arg === "--markdown-out") {
      options.markdownPath = argv[++index] ?? ""
      if (!options.markdownPath) throw new Error(`${arg} requires a path`)
    } else if (arg === "--json-out") {
      options.jsonPath = argv[++index] ?? ""
      if (!options.jsonPath) throw new Error("--json-out requires a path")
    } else if (arg === "--help" || arg === "-h") {
      throw new Error("Usage: debaitable eval-compare [--strategy both|equal|confidence-weighted] [--out path] [--json-out path]")
    } else {
      throw new Error(`Unknown eval-compare option: ${arg}`)
    }
  }
  return options
}

export async function runEvaluationCli(argv: string[] = []): Promise<void> {
  const options = parseEvaluationArgs(argv)
  const report = await runEvaluationReport(EVALUATION_SCENARIOS, options.strategies)
  await writeEvaluationReport(report, options.markdownPath, options.jsonPath)
  process.stdout.write(`${evaluationReportToMarkdown(report)}\n`)
  process.stderr.write(`Wrote ${options.markdownPath} and ${options.jsonPath}\n`)
}
