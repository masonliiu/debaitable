import { DecisionJobPayload } from "./types"
import { DecisionQueue } from "./queue"

export class MemoryDecisionQueue implements DecisionQueue {
  private payloads: DecisionJobPayload[] = []

  async enqueueDecision(payload: DecisionJobPayload): Promise<void> {
    this.payloads = [...this.payloads, payload]
  }

  getPending(): DecisionJobPayload[] {
    return this.payloads.map((payload) => ({ ...payload }))
  }

  clear(): void {
    this.payloads = []
  }
}
