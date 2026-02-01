import {
  DebateRound,
  Decision,
  DecisionInput,
  DecisionRecord,
  DecisionRun,
  DecisionStatus,
  Visibility,
} from "../core"

export type CreateDecisionRequest = {
  input: DecisionInput
  visibility?: Visibility
}

export type CreateDecisionResponse = {
  decisionId: string
  runId: string
  status: DecisionStatus
}

export type GetDecisionResponse = {
  decision: Decision
  record: DecisionRecord | null
  rounds: DebateRound[]
  runs: DecisionRun[]
}

export type ErrorResponse = {
  error: string
  code: "bad_request" | "not_found" | "internal_error"
}
