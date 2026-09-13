import { LlmProvider } from "../ai"
import { DecisionRecord, RoleKey } from "../core"

export type RoleProviderMap = Partial<Record<RoleKey, LlmProvider>>

export type ProposalOutput = {
  roleKey: RoleKey
  summary: string
  recommendation: string
  rationale: string
  risks: string[]
  assumptions: string[]
  actions: string[]
}

export type CritiqueOutput = {
  roleKey: RoleKey
  critiques: string[]
  rebuttals: string[]
  openQuestions: string[]
}

export type Vote = "support" | "conditional" | "oppose"

export type ConvergenceOutput = {
  roleKey: RoleKey
  vote: Vote
  reasons: string[]
  conditions: string[]
  /** Optional confidence weight in [0, 1]. Defaults to 1 when absent. */
  confidence?: number
}

/**
 * Consensus strategy used when tallying convergence votes.
 * - "equal": Each role's vote counts equally (one role, one vote).
 * - "confidence-weighted": Each role's vote is scaled by its confidence score.
 */
export type ConsensusStrategy = "equal" | "confidence-weighted"

/** Side-by-side view of a single role's contribution to the debate. */
export type RoleComparison = {
  roleKey: RoleKey
  /** Model identifier that produced this role's outputs. */
  model: string
  vote: Vote
  /** Raw proposal summary from Round 1. */
  rawPosition: string
  /** Rebuttals the role offered in Round 2 (points of agreement). */
  agreements: string[]
  /** Critiques raised + conditions from convergence (points of dissent). */
  disagreements: string[]
  /** Optional confidence weight carried from convergence output. */
  confidence?: number
}

/** Structured side-by-side comparison artifact for a completed debate run. */
export type ComparisonArtifact = {
  roles: RoleComparison[]
  finalConsensus: DecisionRecord
}
