import { DecisionInput, DecisionRecord } from "../core"
import { ConsensusStrategy, ConvergenceOutput, CritiqueOutput, ProposalOutput } from "./types"
import { tallyVotes } from "./votes"

/**
 * Degraded-consensus synthesis.
 *
 * When one role provider times out or returns malformed JSON, the debate
 * runner continues with surviving roles and calls `synthesizeDecisionRecord`
 * with only those surviving proposals/critiques/convergence votes. This
 * module never throws on partial or empty inputs: it falls back to
 * deterministic summaries, preserves the minority report from surviving
 * dissent, and scores confidence from surviving votes under both `equal`
 * and `confidence-weighted` strategies. Callers record run status, failed
 * role identity, error kind, retry count, and fallback use in the
 * comparison artifact (see `comparison.ts`); synthesis stays total so the
 * run is marked `degraded` instead of aborting.
 */

const dedupe = (values: string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const next = value.trim()
    if (!next) {
      continue
    }
    const key = next.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(next)
  }
  return result
}

const take = (values: string[], max: number): string[] => values.slice(0, max)

const fallbackSummary = (input: DecisionInput): string =>
  `Decision on ${input.title} for ${input.decisionType} priorities.`

const buildRationale = (
  convergence: ConvergenceOutput[],
  proposals: ProposalOutput[]
): string => {
  const voteReasons = convergence.flatMap((item) => item.reasons)
  const proposalRationales = proposals.map((item) => item.rationale)
  const reasons = take(dedupe([...voteReasons, ...proposalRationales]), 3)
  if (reasons.length === 0) {
    return "Rationale assembled from role recommendations and convergence votes."
  }
  return reasons.join(" ")
}

/**
 * Identifies dissenting roles (non-support votes) and assembles their
 * objections into a minority report string. Dissenters are determined from the
 * raw votes regardless of weighting strategy so that every dissenting voice is
 * captured even when confidence-weighting reduces its numerical impact.
 *
 * Degraded runs: operates on surviving convergence/critiques only, so a
 * failed role simply contributes no dissent here; its identity and error kind
 * are recorded in the comparison artifact failures array instead.
 */
export const buildMinorityReport = (
  convergence: ConvergenceOutput[],
  critiques: CritiqueOutput[]
): string => {
  const dissenters = convergence.filter((item) => item.vote !== 'support')
  const dissentReasons = dissenters.flatMap((item) => item.reasons)
  const conditions = dissenters.flatMap((item) => item.conditions)
  const openQuestions = critiques.flatMap((item) => item.openQuestions)
  const lines = take(dedupe([...dissentReasons, ...conditions, ...openQuestions]), 3)
  if (lines.length === 0) {
    return "No substantial minority objections were raised in convergence."
  }
  return lines.join(" ")
}

/** Scores confidence from surviving convergence votes; total on empty input. */
export const scoreConfidence = (convergence: ConvergenceOutput[]): number => {
  if (convergence.length === 0) {
    return 0.4
  }
  const weight = { support: 1, conditional: 0.6, oppose: 0.2 } as const
  const total = convergence.reduce((sum, item) => sum + weight[item.vote], 0)
  const score = total / convergence.length
  return Math.max(0, Math.min(1, Number(score.toFixed(2))))
}

const isBinaryQuestion = (context: string): boolean => {
  const normalized = context.trim().toLowerCase()
  return /^(should|is|are|can|could|do|does|did|will|would)\b/.test(normalized)
}

/**
 * Synthesizes a schema-valid DecisionRecord from surviving role outputs.
 * Safe to call with partial arrays when some roles failed: summary,
 * tradeoffs, risks, and actions fall back to deterministic defaults,
 * confidence is scored from surviving votes, and the minority report is
 * retained under both equal and confidence-weighted tallies.
 */
export const synthesizeDecisionRecord = (
  input: DecisionInput,
  proposals: ProposalOutput[],
  critiques: CritiqueOutput[],
  convergence: ConvergenceOutput[],
  consensusStrategy: ConsensusStrategy = "equal"
): DecisionRecord => {
  const tally = tallyVotes(convergence, consensusStrategy)
  const recommendationLines = proposals.map((item) => item.recommendation)
  const summaryCandidates = take(dedupe(recommendationLines), 2)
  const summary =
    summaryCandidates.length > 0
      ? summaryCandidates.join(' ')
      : fallbackSummary(input)

  const tradeoffs = take(
    dedupe([
      ...critiques.flatMap((item) => item.critiques),
      `Vote split: support=${tally.support}, conditional=${tally.conditional}, oppose=${tally.oppose}`,
    ]),
    5
  )

  const risks = take(
    dedupe([
      ...proposals.flatMap((item) => item.risks),
      ...critiques.flatMap((item) => item.openQuestions),
    ]),
    5
  )

  const actions = take(dedupe(proposals.flatMap((item) => item.actions)), 6)

  const binaryQuestion = isBinaryQuestion(input.context)
  const executiveDecision =
    tally.support >= Math.max(tally.conditional, tally.oppose)
      ? binaryQuestion
        ? "yes"
        : "go"
      : tally.oppose > tally.support
        ? binaryQuestion
          ? "no"
          : "stop"
        : binaryQuestion
          ? "conditional"
          : "iterate"

  return {
    summary,
    rationale: buildRationale(convergence, proposals),
    tradeoffs:
      tradeoffs.length > 0
        ? tradeoffs
        : ["Tradeoffs remain between speed of delivery and downside risk."],
    risks:
      risks.length > 0
        ? risks
        : ["Risk assumptions require validation with real implementation constraints."],
    actions:
      actions.length > 0
        ? actions
        : ["Assign an owner and timeline for the next validation step."],
    confidence: scoreConfidence(convergence),
    minorityReport: buildMinorityReport(convergence, critiques),
    executiveDecision: {
      decision: executiveDecision,
      why: take(
        dedupe([
          ...convergence.flatMap((item) => item.reasons),
          ...proposals.map((item) => item.recommendation),
        ]),
        3
      ),
      topRisks: take(
        dedupe([
          ...proposals.flatMap((item) => item.risks),
          ...critiques.flatMap((item) => item.openQuestions),
        ]),
        3
      ),
      topActions: take(dedupe(proposals.flatMap((item) => item.actions)), 5),
      stopGoCriteria:
        "Choose the positive path only if evidence quality, risk controls, and fairness thresholds are met; otherwise choose the safer alternative or refine the plan.",
    },
  }
}
