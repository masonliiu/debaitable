import { DebateRound, DecisionRecord } from "../core"
import { ComparisonArtifact, ConsensusStrategy, PartialFailure, RoleComparison, RunStatus } from "./types"
import { ConvergenceOutputSchema, CritiqueOutputSchema, ProposalOutputSchema } from "./schemas"
import { DebateRun } from "./run"

/** Optional degraded-run metadata carried on DebateRun once per-role recovery lands. */
type DegradedRunMeta = {
  status?: RunStatus
  failures?: PartialFailure[]
  consensusStrategy?: ConsensusStrategy
}

/** Optional overrides when reconstructing from the durable round audit trail. */
type StoredComparisonOptions = DegradedRunMeta

/**
 * Builds a side-by-side comparison artifact from a completed debate run.
 *
 * For each role that participated in convergence, the function extracts:
 * - model identity (from the convergence LlmCallResult, falling back to proposals)
 * - raw position (proposal summary from Round 1)
 * - vote and confidence (from convergence output)
 * - agreements (rebuttals offered in Round 2 critique)
 * - disagreements (critiques raised in Round 2 + conditions from convergence)
 *
 * Degraded runs: when `run` carries `status`/`failures`/`consensusStrategy`
 * (see `PartialFailure` in `./types`), they are copied through so the saved
 * artifact records run status, failed role identity with provider:model,
 * error kind, retry count, fallback use, and the strategy used for surviving
 * votes. Absent fields default to `{ status: "ok", failures: [],
 * consensusStrategy: "equal" }` for backward compatibility.
 */
export const buildComparisonArtifact = (
  run: DebateRun & DegradedRunMeta
): ComparisonArtifact => {
  const roles: RoleComparison[] = run.convergence.map((conv) => {
    const roleKey = conv.output.roleKey

    const proposal = run.proposals.find((p) => p.output.roleKey === roleKey)
    const critique = run.critiques.find((c) => c.output.roleKey === roleKey)

    // Prefer the model recorded on the convergence call; fall back to proposal.
    const model = conv.model || proposal?.model || "unknown"

    const rawPosition = proposal?.output.summary ?? ""

    const agreements = critique?.output.rebuttals ?? []

    const disagreements: string[] = [
      ...(critique?.output.critiques ?? []),
      ...conv.output.conditions,
    ]

    return {
      roleKey,
      model,
      vote: conv.output.vote,
      rawPosition,
      agreements,
      disagreements,
      confidence: conv.output.confidence,
    }
  })

  const failures = run.failures ?? []
  const status: RunStatus = run.status ?? (failures.length > 0 ? "degraded" : "ok")
  const consensusStrategy: ConsensusStrategy = run.consensusStrategy ?? "equal"

  return {
    roles,
    finalConsensus: run.decisionRecord.output,
    status,
    failures,
    consensusStrategy,
  }
}

const decode = (raw: string): unknown => {
  try { return JSON.parse(raw) } catch { return null }
}

/** Reconstruct a comparison from the durable round audit trail returned by the API. */
export const buildStoredComparisonArtifact = (
  rounds: DebateRound[], finalConsensus: DecisionRecord, opts?: StoredComparisonOptions
): ComparisonArtifact => {
  const proposals = rounds.flatMap((round) => {
    if (round.roundIndex !== 1) return []
    const parsed = ProposalOutputSchema.safeParse(decode(round.output))
    return parsed.success ? [{ ...parsed.data, model: round.model }] : []
  })
  const critiques = rounds.flatMap((round) => {
    if (round.roundIndex !== 2) return []
    const parsed = CritiqueOutputSchema.safeParse(decode(round.output))
    return parsed.success ? [parsed.data] : []
  })
  const roles = rounds.flatMap((round): RoleComparison[] => {
    if (round.roundIndex !== 3) return []
    const parsed = ConvergenceOutputSchema.safeParse(decode(round.output))
    if (!parsed.success) return []
    const convergence = parsed.data
    const proposal = proposals.find(item => item.roleKey === convergence.roleKey)
    const critique = critiques.find(item => item.roleKey === convergence.roleKey)
    return [{ roleKey: convergence.roleKey, model: round.model || proposal?.model || "unknown",
      vote: convergence.vote, confidence: convergence.confidence,
      rawPosition: proposal?.summary ?? "",
      agreements: critique?.rebuttals ?? [],
      disagreements: [...(critique?.critiques ?? []), ...convergence.conditions] }]
  })
  const failures = opts?.failures ?? []
  const status: RunStatus = opts?.status ?? (failures.length > 0 ? "degraded" : "ok")
  const consensusStrategy: ConsensusStrategy = opts?.consensusStrategy ?? "equal"
  return { roles, finalConsensus, status, failures, consensusStrategy }
}
