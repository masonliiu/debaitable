import {
  ConvergenceOutput,
  CritiqueOutput,
  ProposalOutput,
} from "./types"

type CompactProposal = {
  rk: ProposalOutput["roleKey"]
  s: string
  rec: string
  rat: string
  r: string[]
  a: string[]
  act: string[]
}

type CompactCritique = {
  rk: CritiqueOutput["roleKey"]
  c: string[]
  rb: string[]
  q: string[]
}

type CompactConvergence = {
  rk: ConvergenceOutput["roleKey"]
  v: ConvergenceOutput["vote"]
  rs: string[]
  c: string[]
}

export const compactProposal = (output: ProposalOutput): CompactProposal => ({
  rk: output.roleKey,
  s: output.summary,
  rec: output.recommendation,
  rat: output.rationale,
  r: output.risks,
  a: output.assumptions,
  act: output.actions,
})

export const compactCritique = (output: CritiqueOutput): CompactCritique => ({
  rk: output.roleKey,
  c: output.critiques,
  rb: output.rebuttals,
  q: output.openQuestions,
})

export const compactConvergence = (
  output: ConvergenceOutput
): CompactConvergence => ({
  rk: output.roleKey,
  v: output.vote,
  rs: output.reasons,
  c: output.conditions,
})

export const formatCompactProposals = (outputs: ProposalOutput[]): string =>
  JSON.stringify(outputs.map(compactProposal))

export const formatCompactCritiques = (outputs: CritiqueOutput[]): string =>
  JSON.stringify(outputs.map(compactCritique))

export const formatCompactConvergence = (
  outputs: ConvergenceOutput[]
): string => JSON.stringify(outputs.map(compactConvergence))
