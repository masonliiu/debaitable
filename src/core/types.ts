export type DecisionType = "product" | "engineering" | "hiring" | "growth" | "general"

export type DecisionStatus = "queued" | "running" | "succeeded" | "failed"

export type Visibility = "private" | "unlisted" | "public"

export type RoleKey =
  | "strategist"
  | "skeptic"
  | "risk_analyst"
  | "execution_planner"
  | "cost_roi"

export type DecisionInput = {
  title: string
  context: string
  goals: string[]
  constraints: string[]
  decisionType: DecisionType
}

export type RoleDefinition = {
  key: RoleKey
  name: string
  focus: string
}

export type DebateRound = {
  roundIndex: number
  roleKey: RoleKey
  output: string
}

export type DecisionRecord = {
  summary: string
  rationale: string
  tradeoffs: string[]
  risks: string[]
  actions: string[]
  confidence: number
  minorityReport: string
  executiveDecision: {
    decision: "go" | "iterate" | "stop" | "yes" | "no" | "conditional"
    why: string[]
    topRisks: string[]
    topActions: string[]
    stopGoCriteria: string
  }
}

export type Decision = {
  id: string
  title: string
  context: string
  goals: string[]
  constraints: string[]
  decisionType: DecisionType
  status: DecisionStatus
  visibility: Visibility
}

export type DecisionRun = {
  runId: string
  decisionId: string
  status: DecisionStatus
}
