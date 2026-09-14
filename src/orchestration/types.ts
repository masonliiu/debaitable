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
  /** Run status: "ok" when all roles succeeded, "degraded" when any role failed but surviving roles still produced a record. Defaults to "ok" when absent for backward compatibility. */
  status?: RunStatus
  /** Per-role provider failures recovered via retry/fallback or skipped. Empty when status is "ok". */
  failures?: PartialFailure[]
  /** Consensus strategy used to tally surviving votes. */
  consensusStrategy?: ConsensusStrategy
}

/**
 * Overall debate run status.
 * - "ok": all roles completed without unrecovered errors.
 * - "degraded": at least one role failed (timeout, malformed JSON, auth)
 *   but surviving roles still produced a schema-valid DecisionRecord.
 */
export type RunStatus = "ok" | "degraded"

/** Classified per-role provider error kind for degraded-run reporting. */
export type FailureKind = "timeout" | "malformed" | "auth" | "unknown"

/** Alias kept for readability at call sites that prefer the longer name. */
export type PartialFailureKind = FailureKind

/**
 * Traceable record of a single role provider failure that did not abort the run.
 * Identity is kept as provider + model ("provider:model") alongside the role key
 * so saved artifacts and the TUI can list exactly which role failed and how it recovered.
 */
export type PartialFailure = {
  roleKey: RoleKey
  /** Provider adapter name (e.g. "openai", "anthropic", "heuristic"). */
  provider: string
  /** Model identifier reported by the provider, or "unknown" when unavailable. */
  model: string
  /** Classified error kind: timeout vs malformed vs auth (vs unknown). */
  kind: FailureKind
  /** Number of retries attempted via the existing RetryProvider path before giving up or recovering. */
  retryCount: number
  /** Whether a fallback provider output was used for this role. */
  fallbackUsed: boolean
  /** Short sanitized error message without secrets or raw prompt content. */
  message?: string
}
