import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { HeuristicDebateProvider } from "../src/ai/heuristic-provider.js"
import type { LlmProvider, LlmRequest, LlmResponse } from "../src/ai/types.js"
import { roleDefinitions } from "../src/core/roles.js"
import { DecisionRecordSchema } from "../src/core/schemas.js"
import { buildComparisonArtifact } from "../src/orchestration/comparison.js"
import { runDebate } from "../src/orchestration/run.js"
import type { ConsensusStrategy } from "../src/orchestration/types.js"
import { runDecisionJob } from "../src/jobs/run-decision.js"
import { MemoryDecisionStore } from "../src/persistence/memory-store.js"

const INPUT = {
  title: "Ship a local model router",
  context: "Should we ship a local model router for the next release?",
  goals: ["Keep inference costs predictable", "Preserve useful model diversity"],
  constraints: ["No paid API key is required for the test", "Keep an audit trail"],
  decisionType: "engineering" as const,
}

class FailingProvider implements LlmProvider {
  constructor(private readonly kind: "timeout" | "malformed") {}

  async generate<TSchema, TOutput>(
    _request: LlmRequest<TSchema>,
  ): Promise<LlmResponse<TOutput>> {
    if (this.kind === "timeout") {
      throw new Error("provider request timed out")
    }
    throw new SyntaxError("malformed JSON response")
  }
}

const runWithFailures = async (strategy: ConsensusStrategy = "equal") => {
  const provider = new HeuristicDebateProvider()
  return runDebate({
    input: INPUT,
    roles: roleDefinitions,
    provider,
    providerMap: providerMapWithFailures(),
    consensusStrategy: strategy,
  })
}

const providerMapWithFailures = (): Record<string, LlmProvider> => ({
  skeptic: new FailingProvider("timeout"),
  cost_roi: new FailingProvider("malformed"),
})

describe("degraded debate runs", () => {
  it("continues with surviving roles and records timeout/malformed evidence", async () => {
    const run = await runWithFailures()
    assert.equal(run.status, "degraded")
    assert.equal(run.failures.length, 2)
    assert.deepEqual(
      run.failures.map((failure) => failure.roleKey),
      ["skeptic", "cost_roi"],
    )
    assert.deepEqual(
      run.failures.map((failure) => failure.kind),
      ["timeout", "malformed"],
    )
    assert.equal(run.proposals.length, roleDefinitions.length - 2)
    assert.equal(run.convergence.length, roleDefinitions.length - 2)

    const parsed = DecisionRecordSchema.safeParse(run.decisionRecord.output)
    assert.equal(parsed.success, true)

    const artifact = buildComparisonArtifact(run)
    assert.equal(artifact.status, "degraded")
    assert.equal(artifact.consensusStrategy, "equal")
    assert.equal(artifact.failures?.[0]?.provider, "FailingProvider")
    assert.equal(artifact.failures?.[0]?.fallbackUsed, false)
    assert.equal(artifact.roles.length, roleDefinitions.length - 2)
  })

  it("keeps the selected confidence-weighted strategy in the artifact", async () => {
    const run = await runWithFailures("confidence-weighted")
    const artifact = buildComparisonArtifact(run)
    assert.equal(artifact.consensusStrategy, "confidence-weighted")
    assert.equal(artifact.status, "degraded")
    assert.ok(artifact.finalConsensus.minorityReport.length > 0)
  })

  it("persists degraded metadata with the successful job run", async () => {
    const store = new MemoryDecisionStore()
    const decision = await store.createDecision({ ...INPUT, visibility: "private" })
    await runDecisionJob(
      { decisionId: decision.id, runId: "degraded-run-001" },
      {
        store,
        roles: roleDefinitions,
        provider: new HeuristicDebateProvider(),
        providerMap: providerMapWithFailures(),
      },
    )

    const run = await store.getDecisionRun("degraded-run-001")
    assert.equal(run?.status, "succeeded")
    assert.equal(run?.metadata?.debateStatus, "degraded")
    assert.equal(run?.metadata?.failures?.length, 2)
    assert.equal(run?.metadata?.consensusStrategy, "equal")
  })
})
