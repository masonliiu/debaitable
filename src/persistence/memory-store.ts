import {
  DebateRound,
  Decision,
  DecisionRecord,
  DecisionRun,
  DEFAULT_STATUS,
  DEFAULT_VISIBILITY,
  NotFoundError,
} from "../core"
import { DecisionCreateInput, DecisionStore, DecisionUpdate } from "./types"

type MemoryState = {
  decisions: Map<string, Decision>
  records: Map<string, DecisionRecord>
  rounds: Map<string, DebateRound[]>
  runs: Map<string, DecisionRun>
  runsByDecision: Map<string, string[]>
  counter: number
}

const cloneDecision = (decision: Decision): Decision => ({
  ...decision,
  goals: [...decision.goals],
  constraints: [...decision.constraints],
})

const cloneRounds = (rounds: DebateRound[]): DebateRound[] =>
  rounds.map((round) => ({ ...round }))

const cloneRun = (run: DecisionRun): DecisionRun => ({ ...run })

export class MemoryDecisionStore implements DecisionStore {
  private state: MemoryState

  constructor() {
    this.state = {
      decisions: new Map(),
      records: new Map(),
      rounds: new Map(),
      runs: new Map(),
      runsByDecision: new Map(),
      counter: 0,
    }
  }

  async createDecision(input: DecisionCreateInput): Promise<Decision> {
    const id = this.nextId()
    const decision: Decision = {
      id,
      title: input.title,
      context: input.context,
      goals: [...input.goals],
      constraints: [...input.constraints],
      decisionType: input.decisionType,
      status: DEFAULT_STATUS,
      visibility: input.visibility ?? DEFAULT_VISIBILITY,
    }
    this.state.decisions.set(id, decision)
    return cloneDecision(decision)
  }

  async updateDecision(id: string, update: DecisionUpdate): Promise<Decision> {
    const current = this.state.decisions.get(id)
    if (!current) {
      throw new NotFoundError(`Decision not found: ${id}`)
    }
    const next: Decision = {
      ...current,
      status: update.status ?? current.status,
      visibility: update.visibility ?? current.visibility,
    }
    this.state.decisions.set(id, next)
    return cloneDecision(next)
  }

  async saveDecisionRecord(id: string, record: DecisionRecord): Promise<void> {
    if (!this.state.decisions.has(id)) {
      throw new NotFoundError(`Decision not found: ${id}`)
    }
    this.state.records.set(id, { ...record })
  }

  async saveDebateRounds(id: string, rounds: DebateRound[]): Promise<void> {
    if (!this.state.decisions.has(id)) {
      throw new NotFoundError(`Decision not found: ${id}`)
    }
    this.state.rounds.set(id, cloneRounds(rounds))
  }

  async getDecision(id: string): Promise<Decision | null> {
    const decision = this.state.decisions.get(id)
    return decision ? cloneDecision(decision) : null
  }

  async getDecisionRecord(id: string): Promise<DecisionRecord | null> {
    const record = this.state.records.get(id)
    return record ? { ...record } : null
  }

  async getDebateRounds(id: string): Promise<DebateRound[]> {
    return cloneRounds(this.state.rounds.get(id) ?? [])
  }

  async saveDecisionRun(run: DecisionRun): Promise<void> {
    if (!this.state.decisions.has(run.decisionId)) {
      throw new NotFoundError(`Decision not found: ${run.decisionId}`)
    }
    this.state.runs.set(run.runId, { ...run })
    const existing = this.state.runsByDecision.get(run.decisionId) ?? []
    const next = existing.includes(run.runId)
      ? existing
      : [...existing, run.runId]
    this.state.runsByDecision.set(run.decisionId, next)
  }

  async getDecisionRun(runId: string): Promise<DecisionRun | null> {
    const run = this.state.runs.get(runId)
    return run ? cloneRun(run) : null
  }

  async listDecisionRuns(decisionId: string): Promise<DecisionRun[]> {
    const runIds = this.state.runsByDecision.get(decisionId) ?? []
    return runIds
      .map((runId) => this.state.runs.get(runId))
      .filter((run): run is DecisionRun => Boolean(run))
      .map(cloneRun)
  }

  private nextId(): string {
    this.state.counter += 1
    return `decision_${this.state.counter}`
  }
}
