import { LlmProvider } from "../ai"
import { RoleKey } from "../core"

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
