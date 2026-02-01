import {
  DebateRound,
  Decision,
  DecisionInput,
  DecisionRecord,
  DecisionRun,
  DecisionStatus,
  Visibility,
} from "../core"

export type DecisionCreateInput = DecisionInput & {
  visibility: Visibility
}

export type DecisionUpdate = {
  status?: DecisionStatus
  visibility?: Visibility
}

export type DecisionStore = {
  createDecision: (input: DecisionCreateInput) => Promise<Decision>
  updateDecision: (id: string, update: DecisionUpdate) => Promise<Decision>
  saveDecisionRecord: (id: string, record: DecisionRecord) => Promise<void>
  saveDebateRounds: (id: string, rounds: DebateRound[]) => Promise<void>
  getDecision: (id: string) => Promise<Decision | null>
  getDecisionRecord: (id: string) => Promise<DecisionRecord | null>
  getDebateRounds: (id: string) => Promise<DebateRound[]>
  saveDecisionRun: (run: DecisionRun) => Promise<void>
  getDecisionRun: (runId: string) => Promise<DecisionRun | null>
  listDecisionRuns: (decisionId: string) => Promise<DecisionRun[]>
}
