import { LlmProvider } from "../ai"
import { DecisionInput, NotFoundError, RoleDefinition } from "../core"
import { runDebate } from "../orchestration"
import { DecisionStore } from "../persistence"
import { DecisionJobPayload } from "./types"

export type DecisionJobContext = {
  provider: LlmProvider
  store: DecisionStore
  roles: RoleDefinition[]
}

const toDecisionInput = (decision: {
  title: string
  context: string
  goals: string[]
  constraints: string[]
  decisionType: DecisionInput["decisionType"]
}): DecisionInput => ({
  title: decision.title,
  context: decision.context,
  goals: decision.goals,
  constraints: decision.constraints,
  decisionType: decision.decisionType,
})

export const runDecisionJob = async (
  payload: DecisionJobPayload,
  context: DecisionJobContext
): Promise<void> => {
  const decision = await context.store.getDecision(payload.decisionId)
  if (!decision) {
    throw new NotFoundError(`Decision not found: ${payload.decisionId}`)
  }
  await context.store.saveDecisionRun({
    runId: payload.runId,
    decisionId: decision.id,
    status: "running",
  })
  await context.store.updateDecision(decision.id, {
    status: "running",
  })
  try {
    const run = await runDebate({
      input: toDecisionInput(decision),
      roles: context.roles,
      provider: context.provider,
    })
    await context.store.saveDebateRounds(decision.id, run.rounds)
    await context.store.saveDecisionRecord(decision.id, run.decisionRecord.output)
    await context.store.saveDecisionRun({
      runId: payload.runId,
      decisionId: decision.id,
      status: "succeeded",
    })
    await context.store.updateDecision(decision.id, {
      status: "succeeded",
    })
  } catch (error) {
    await context.store.saveDecisionRun({
      runId: payload.runId,
      decisionId: decision.id,
      status: "failed",
    })
    await context.store.updateDecision(decision.id, {
      status: "failed",
    })
    throw error
  }
}
