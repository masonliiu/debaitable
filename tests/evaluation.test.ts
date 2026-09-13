import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { FallbackProvider } from "../src/ai/fallback-provider.js"
import { HeuristicDebateProvider } from "../src/ai/heuristic-provider.js"
import type { LlmProvider, LlmRequest, LlmResponse } from "../src/ai/types.js"
import { roleDefinitions } from "../src/core/roles.js"
import { DecisionRecordSchema } from "../src/core/schemas.js"
import { runDecisionJob } from "../src/jobs/run-decision.js"
import { MemoryDecisionStore } from "../src/persistence/memory-store.js"

// ---------------------------------------------------------------------------
// Evaluation dataset: 3 distinct decision scenarios
// ---------------------------------------------------------------------------
const EVALUATION_SCENARIOS = [
  {
    id: "scenario-product",
    input: {
      title: "Launch mobile app MVP",
      context: "We need to decide whether to launch a mobile app MVP within 60 days.",
      goals: ["Capture early adopters", "Validate product-market fit"],
      constraints: ["Limited engineering resources", "Q4 budget freeze"],
      decisionType: "product" as const,
    },
  },
  {
    id: "scenario-engineering",
    input: {
      title: "Migrate to microservices",
      context: "Should we migrate our monolith to microservices?",
      goals: ["Improve scalability", "Enable independent deployments"],
      constraints: ["Zero downtime required", "Team of 5 engineers"],
      decisionType: "engineering" as const,
    },
  },
  {
    id: "scenario-hiring",
    input: {
      title: "Hire offshore engineering team",
      context: "Is hiring an offshore engineering team the right choice?",
      goals: ["Reduce cost", "Scale capacity rapidly"],
      constraints: ["Timezone overlap minimum 4 hours", "IP protection requirements"],
      decisionType: "hiring" as const,
    },
  },
] as const

// ---------------------------------------------------------------------------
// Helper: always-failing provider (simulates a dead upstream)
// ---------------------------------------------------------------------------
class AlwaysFailingProvider implements LlmProvider {
  private readonly message: string
  constructor(message = "simulated provider failure") {
    this.message = message
  }
  async generate<TSchema, TOutput>(
    _request: LlmRequest<TSchema>,
  ): Promise<LlmResponse<TOutput>> {
    throw new Error(this.message)
  }
}

// ---------------------------------------------------------------------------
// Suite 1: Schema validity across the full evaluation dataset
// ---------------------------------------------------------------------------
describe("Evaluation: schema validity for all scenarios", () => {
  for (const scenario of EVALUATION_SCENARIOS) {
    it(`[${scenario.id}] produces a DecisionRecord conforming to DecisionRecordSchema`, async () => {
      const store = new MemoryDecisionStore()
      const provider = new HeuristicDebateProvider()

      const decision = await store.createDecision(scenario.input)
      await runDecisionJob(
        { decisionId: decision.id, runId: `${scenario.id}-schema` },
        { provider, store, roles: roleDefinitions },
      )

      const updated = await store.getDecision(decision.id)
      assert.equal(updated?.status, "succeeded", "decision status must be succeeded")

      const record = await store.getDecisionRecord(decision.id)
      assert.ok(record !== null, "a DecisionRecord must be persisted")

      const parsed = DecisionRecordSchema.safeParse(record)
      assert.ok(
        parsed.success,
        `[${scenario.id}] DecisionRecord failed schema validation: ${
          !parsed.success ? JSON.stringify(parsed.error.issues) : ""
        }`,
      )
    })
  }
})

// ---------------------------------------------------------------------------
// Suite 2: Minority report preservation for divergent role outputs
// ---------------------------------------------------------------------------
describe("Evaluation: minority reports are preserved when roles diverge", () => {
  // The HeuristicDebateProvider always makes skeptic + risk_analyst vote
  // 'conditional' while strategist, execution_planner, and cost_roi vote
  // 'support'. This guaranteed divergence must be captured in minorityReport.
  for (const scenario of EVALUATION_SCENARIOS) {
    it(`[${scenario.id}] minorityReport is a non-empty string reflecting conditional voters`, async () => {
      const store = new MemoryDecisionStore()
      const provider = new HeuristicDebateProvider()

      const decision = await store.createDecision(scenario.input)
      await runDecisionJob(
        { decisionId: decision.id, runId: `${scenario.id}-minority` },
        { provider, store, roles: roleDefinitions },
      )

      const record = await store.getDecisionRecord(decision.id)
      assert.ok(record !== null, "DecisionRecord must exist")

      const parsed = DecisionRecordSchema.safeParse(record)
      assert.ok(parsed.success, "record must satisfy schema before minority-report check")

      if (parsed.success) {
        assert.ok(
          typeof parsed.data.minorityReport === "string" &&
            parsed.data.minorityReport.length > 0,
          `[${scenario.id}] minorityReport must be a non-empty string`,
        )
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Suite 3: Deterministic recovery via FallbackProvider
// ---------------------------------------------------------------------------
describe("Evaluation: deterministic recovery via FallbackProvider on simulated failure", () => {
  for (const scenario of EVALUATION_SCENARIOS) {
    it(`[${scenario.id}] yields a valid DecisionRecord when primary provider fails and fallback succeeds`, async () => {
      const store = new MemoryDecisionStore()

      // Primary provider always throws; fallback uses the heuristic provider.
      const failing = new AlwaysFailingProvider(`[${scenario.id}] primary down`)
      const heuristic = new HeuristicDebateProvider()
      const provider = new FallbackProvider([failing, heuristic])

      const decision = await store.createDecision(scenario.input)
      await runDecisionJob(
        { decisionId: decision.id, runId: `${scenario.id}-fallback` },
        { provider, store, roles: roleDefinitions },
      )

      const updated = await store.getDecision(decision.id)
      assert.equal(
        updated?.status,
        "succeeded",
        `[${scenario.id}] decision status must be succeeded after fallback`,
      )

      const record = await store.getDecisionRecord(decision.id)
      assert.ok(record !== null, `[${scenario.id}] DecisionRecord must be persisted after fallback`)

      const parsed = DecisionRecordSchema.safeParse(record)
      assert.ok(
        parsed.success,
        `[${scenario.id}] DecisionRecord failed schema validation after fallback: ${
          !parsed.success ? JSON.stringify(parsed.error.issues) : ""
        }`,
      )

      const rounds = await store.getDebateRounds(decision.id)
      assert.ok(rounds.length > 0, `[${scenario.id}] debate rounds must be stored after fallback`)

      const roundIndices = new Set(rounds.map((r) => r.roundIndex))
      assert.ok(roundIndices.has(1), `[${scenario.id}] round 1 must be present after fallback`)
      assert.ok(roundIndices.has(2), `[${scenario.id}] round 2 must be present after fallback`)
      assert.ok(roundIndices.has(3), `[${scenario.id}] round 3 must be present after fallback`)
    })
  }
})
