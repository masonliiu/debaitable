import { OUTPUT_TEXT_LIMIT } from "./constants"
import { DecisionRecord } from "../core"
import { ConvergenceOutput, CritiqueOutput, ProposalOutput } from "./types"

const normalizeText = (value: string, limit = OUTPUT_TEXT_LIMIT) =>
  value
    .replace(/\s+/g, " ")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, limit)

const dedupe = (values: string[]) => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const key = value.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(value)
    }
  }
  return result
}

const normalizeList = (values: string[], maxItems: number, limit = 240) =>
  dedupe(values.map((value) => normalizeText(value, limit)).filter((value) => value.length > 0)).slice(
    0,
    maxItems
  )

export const normalizeProposalOutput = (
  output: ProposalOutput
): ProposalOutput => ({
  roleKey: output.roleKey,
  summary: normalizeText(output.summary, 260),
  recommendation: normalizeText(output.recommendation, 260),
  rationale: normalizeText(output.rationale, 320),
  risks: normalizeList(output.risks, 6),
  assumptions: normalizeList(output.assumptions, 6),
  actions: normalizeList(output.actions, 8),
})

export const normalizeCritiqueOutput = (
  output: CritiqueOutput
): CritiqueOutput => ({
  roleKey: output.roleKey,
  critiques: normalizeList(output.critiques, 8),
  rebuttals: normalizeList(output.rebuttals, 8),
  openQuestions: normalizeList(output.openQuestions, 8),
})

export const normalizeConvergenceOutput = (
  output: ConvergenceOutput
): ConvergenceOutput => ({
  roleKey: output.roleKey,
  vote: output.vote,
  reasons: normalizeList(output.reasons, 5),
  conditions: normalizeList(output.conditions, 5),
})

export const normalizeDecisionRecordOutput = (
  output: DecisionRecord
): DecisionRecord => ({
  summary: normalizeText(output.summary, 700),
  rationale: normalizeText(output.rationale, 850),
  tradeoffs: normalizeList(output.tradeoffs, 6),
  risks: normalizeList(output.risks, 8),
  actions: normalizeList(output.actions, 8),
  confidence: Math.max(0, Math.min(1, Number(output.confidence.toFixed(2)))),
  minorityReport: normalizeText(output.minorityReport, 500),
  executiveDecision: {
    decision: output.executiveDecision.decision,
    why: normalizeList(output.executiveDecision.why, 3, 220),
    topRisks: normalizeList(output.executiveDecision.topRisks, 3, 220),
    topActions: normalizeList(output.executiveDecision.topActions, 5, 220),
    stopGoCriteria: normalizeText(output.executiveDecision.stopGoCriteria, 300),
  },
})
