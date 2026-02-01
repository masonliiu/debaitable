import {
  ConvergenceOutput,
  CritiqueOutput,
  ProposalOutput,
} from "./types"

export const serializeProposalOutput = (output: ProposalOutput): string =>
  JSON.stringify({
    roleKey: output.roleKey,
    summary: output.summary,
    recommendation: output.recommendation,
    rationale: output.rationale,
    risks: output.risks,
    assumptions: output.assumptions,
    actions: output.actions,
  })

export const serializeCritiqueOutput = (output: CritiqueOutput): string =>
  JSON.stringify({
    roleKey: output.roleKey,
    critiques: output.critiques,
    rebuttals: output.rebuttals,
    openQuestions: output.openQuestions,
  })

export const serializeConvergenceOutput = (
  output: ConvergenceOutput
): string =>
  JSON.stringify({
    roleKey: output.roleKey,
    vote: output.vote,
    reasons: output.reasons,
    conditions: output.conditions,
  })
