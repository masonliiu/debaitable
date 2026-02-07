import { DecisionInput, DecisionRecord } from "../core"
import { ConvergenceOutput, CritiqueOutput, ProposalOutput } from "./types"
import { tallyVotes } from "./votes"

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

const buildMinorityReport = (
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

const scoreConfidence = (convergence: ConvergenceOutput[]): number => {
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

export const synthesizeDecisionRecord = (
  input: DecisionInput,
  proposals: ProposalOutput[],
  critiques: CritiqueOutput[],
  convergence: ConvergenceOutput[]
): DecisionRecord => {
  const tally = tallyVotes(convergence)
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
