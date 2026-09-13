import { DebateRound, DecisionRecord } from "../core"
import { ComparisonArtifact, RoleComparison } from "./types"
import { ConvergenceOutputSchema, CritiqueOutputSchema, ProposalOutputSchema } from "./schemas"
import { DebateRun } from "./run"

/**
 * Builds a side-by-side comparison artifact from a completed debate run.
 *
 * For each role that participated in convergence, the function extracts:
 * - model identity (from the convergence LlmCallResult, falling back to proposals)
 * - raw position (proposal summary from Round 1)
 * - vote and confidence (from convergence output)
 * - agreements (rebuttals offered in Round 2 critique)
 * - disagreements (critiques raised in Round 2 + conditions from convergence)
 */
export const buildComparisonArtifact = (run: DebateRun): ComparisonArtifact => {
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

  return {
    roles,
    finalConsensus: run.decisionRecord.output,
  }
}

const decode = (raw: string): unknown => {
  try { return JSON.parse(raw) } catch { return null }
}

/** Reconstruct a comparison from the durable round audit trail returned by the API. */
export const buildStoredComparisonArtifact = (
  rounds: DebateRound[], finalConsensus: DecisionRecord
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
  return { roles, finalConsensus }
}
