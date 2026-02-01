import { ConvergenceOutput, CritiqueOutput, ProposalOutput } from "./types"

const normalizeText = (value: string) => value.trim()

const normalizeList = (values: string[]) =>
  values.map(normalizeText).filter((value) => value.length > 0)

export const normalizeProposalOutput = (
  output: ProposalOutput
): ProposalOutput => ({
  roleKey: output.roleKey,
  summary: normalizeText(output.summary),
  recommendation: normalizeText(output.recommendation),
  rationale: normalizeText(output.rationale),
  risks: normalizeList(output.risks),
  assumptions: normalizeList(output.assumptions),
  actions: normalizeList(output.actions),
})

export const normalizeCritiqueOutput = (
  output: CritiqueOutput
): CritiqueOutput => ({
  roleKey: output.roleKey,
  critiques: normalizeList(output.critiques),
  rebuttals: normalizeList(output.rebuttals),
  openQuestions: normalizeList(output.openQuestions),
})

export const normalizeConvergenceOutput = (
  output: ConvergenceOutput
): ConvergenceOutput => ({
  roleKey: output.roleKey,
  vote: output.vote,
  reasons: normalizeList(output.reasons),
  conditions: normalizeList(output.conditions),
})
