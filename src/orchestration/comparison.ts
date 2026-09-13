import { ComparisonArtifact, RoleComparison } from "./types"
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
