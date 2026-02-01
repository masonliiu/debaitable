import { LlmProvider } from "../ai"
import { DecisionInput, RoleDefinition } from "../core"
import { createDecision, getDecision } from "../api"
import { MemoryDecisionQueue, runDecisionJob } from "../jobs"
import { MemoryDecisionStore } from "../persistence"

export const runDemo = async (
  input: DecisionInput,
  roles: RoleDefinition[],
  provider: LlmProvider
) => {
  const store = new MemoryDecisionStore()
  const queue = new MemoryDecisionQueue()
  const context = {
    store,
    queue,
    generateRunId: () => "run_1",
  }
  const response = await createDecision({ input }, context)
  for (const payload of queue.getPending()) {
    await runDecisionJob(payload, { provider, store, roles })
  }
  return getDecision(response.decisionId, context)
}
