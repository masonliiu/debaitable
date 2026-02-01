import { DEFAULT_VISIBILITY, NotFoundError, sanitizeDecisionInput } from "../core"
import { DecisionQueue } from "../jobs"
import { DecisionStore } from "../persistence"
import {
  CreateDecisionRequest,
  CreateDecisionResponse,
  GetDecisionResponse,
} from "./types"
import { parseCreateDecisionRequest } from "./validate"

export type ApiContext = {
  store: DecisionStore
  queue: DecisionQueue
  generateRunId: () => string
}

export const createDecision = async (
  request: CreateDecisionRequest,
  context: ApiContext
): Promise<CreateDecisionResponse> => {
  const parsed = parseCreateDecisionRequest(request)
  const input = sanitizeDecisionInput(parsed.input)
  const decision = await context.store.createDecision({
    ...input,
    visibility: parsed.visibility ?? DEFAULT_VISIBILITY,
  })
  const runId = context.generateRunId()
  await context.store.saveDecisionRun({
    runId,
    decisionId: decision.id,
    status: "queued",
  })
  await context.queue.enqueueDecision({
    decisionId: decision.id,
    runId,
  })
  return {
    decisionId: decision.id,
    runId,
    status: decision.status,
  }
}

export const getDecision = async (
  decisionId: string,
  context: ApiContext
): Promise<GetDecisionResponse> => {
  const decision = await context.store.getDecision(decisionId)
  if (!decision) {
    throw new NotFoundError(`Decision not found: ${decisionId}`)
  }
  const record = await context.store.getDecisionRecord(decisionId)
  const rounds = await context.store.getDebateRounds(decisionId)
  const runs = await context.store.listDecisionRuns(decisionId)
  return {
    decision,
    record,
    rounds,
    runs,
  }
}
