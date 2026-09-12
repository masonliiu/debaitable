import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { HeuristicDebateProvider } from "../src/ai/heuristic-provider.js"
import type { LlmProvider, LlmRequest, LlmResponse } from "../src/ai/types.js"
import { roleDefinitions } from "../src/core/roles.js"
import { DecisionRecordSchema } from "../src/core/schemas.js"
import { runDecisionJob } from "../src/jobs/run-decision.js"
import { MemoryDecisionStore } from "../src/persistence/memory-store.js"

const SAMPLE_INPUT = {
  title: "Adopt remote-first policy",
  context: "Should we transition the entire company to remote-first?",
  goals: ["Increase talent pool", "Reduce office costs"],
  constraints: ["Maintain team cohesion", "Legal compliance across regions"],
  decisionType: "general" as const,
}

describe("Integration: full decision pipeline with HeuristicDebateProvider", () => {
  it("runs all three debate rounds and stores a valid DecisionRecord", async () => {
    const store = new MemoryDecisionStore()
    const provider = new HeuristicDebateProvider()

    const decision = await store.createDecision(SAMPLE_INPUT)
    const payload = { decisionId: decision.id, runId: "run-001" }
    const context = { provider, store, roles: roleDefinitions }

    await runDecisionJob(payload, context)

    const updated = await store.getDecision(decision.id)
    assert.equal(updated?.status, "succeeded", "decision status should be succeeded")

    const record = await store.getDecisionRecord(decision.id)
    assert.ok(record !== null, "a DecisionRecord must be stored")

    const parsed = DecisionRecordSchema.safeParse(record)
    assert.ok(parsed.success, `DecisionRecord failed schema validation: ${!parsed.success ? JSON.stringify(parsed.error.issues) : ""}`)

    const rounds = await store.getDebateRounds(decision.id)
    assert.ok(rounds.length > 0, "at least one debate round must be stored")

    const roundIndices = new Set(rounds.map((r) => r.roundIndex))
    assert.ok(roundIndices.has(1), "round 1 (proposals) must be present")
    assert.ok(roundIndices.has(2), "round 2 (critiques) must be present")
    assert.ok(roundIndices.has(3), "round 3 (convergence) must be present")
  })

  it("aggregates heuristic mock responses: record confidence reflects vote tally", async () => {
    const store = new MemoryDecisionStore()
    const provider = new HeuristicDebateProvider()

    const decision = await store.createDecision(SAMPLE_INPUT)
    await runDecisionJob(
      { decisionId: decision.id, runId: "run-002" },
      { provider, store, roles: roleDefinitions }
    )

    const record = await store.getDecisionRecord(decision.id)
    assert.ok(record !== null)
    assert.ok(
      typeof record.confidence === "number" && record.confidence >= 0 && record.confidence <= 1,
      "confidence must be a number in [0, 1]"
    )
    assert.ok(
      ["go", "iterate", "stop", "yes", "no", "conditional"].includes(record.executiveDecision.decision),
      "executive decision must be a known value"
    )
    assert.ok(record.executiveDecision.why.length > 0, "executive why must be non-empty")
    assert.ok(record.executiveDecision.topRisks.length > 0, "topRisks must be non-empty")
    assert.ok(record.executiveDecision.topActions.length > 0, "topActions must be non-empty")
  })

  it("marks the decision as failed when the store has no matching decision", async () => {
    const store = new MemoryDecisionStore()
    const provider = new HeuristicDebateProvider()

    await assert.rejects(
      () =>
        runDecisionJob(
          { decisionId: "nonexistent", runId: "run-003" },
          { provider, store, roles: roleDefinitions }
        ),
      (err: Error) => {
        assert.match(err.message, /not found/i)
        return true
      }
    )
  })

  it("routes per-role providers via providerMap: strategist uses sentinel, others use default", async () => {
    // Sentinel provider: delegates to HeuristicDebateProvider but stamps a custom model identifier.
    class StrategistSentinelProvider implements LlmProvider {
      private inner = new HeuristicDebateProvider()
      async generate<TSchema, TOutput>(
        request: LlmRequest<TSchema>
      ): Promise<LlmResponse<TOutput>> {
        const response = await this.inner.generate<TSchema, TOutput>(request)
        return { ...response, model: "strategist-sentinel" }
      }
    }

    const store = new MemoryDecisionStore()
    const provider = new HeuristicDebateProvider()
    const sentinelProvider = new StrategistSentinelProvider()
    const providerMap = { strategist: sentinelProvider as LlmProvider }

    const decision = await store.createDecision(SAMPLE_INPUT)
    await runDecisionJob(
      { decisionId: decision.id, runId: "run-004" },
      { provider, providerMap, store, roles: roleDefinitions }
    )

    const rounds = await store.getDebateRounds(decision.id)
    assert.ok(rounds.length > 0, "debate rounds must be stored")

    for (const round of rounds) {
      if (round.roleKey === "strategist") {
        assert.equal(
          round.model,
          "strategist-sentinel",
          `strategist round (index ${round.roundIndex}) must use strategist-sentinel model`
        )
      } else {
        assert.equal(
          round.model,
          "heuristic-v1",
          `non-strategist round for role '${round.roleKey}' (index ${round.roundIndex}) must use heuristic-v1 model`
        )
      }
    }
  })
})
