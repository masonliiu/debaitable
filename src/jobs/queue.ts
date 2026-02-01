import { DecisionJobPayload } from "./types"

export type DecisionQueue = {
  enqueueDecision: (payload: DecisionJobPayload) => Promise<void>
}
