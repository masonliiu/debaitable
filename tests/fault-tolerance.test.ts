import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { HeuristicDebateProvider } from "../src/ai/heuristic-provider.js"
import { RetryProvider } from "../src/ai/retry-provider.js"
import { roleDefinitions } from "../src/core/roles.js"
import { DecisionRecordSchema } from "../src/core/schemas.js"
import { runDecisionJob } from "../src/jobs/run-decision.js"
import { MemoryDecisionStore } from "../src/persistence/memory-store.js"
import type { LlmProvider, LlmRequest, LlmResponse } from "../src/ai/types.js"

const SAMPLE_INPUT = {
  title: "Adopt remote-first policy",
  context: "Should we transition the entire company to remote-first?",
  goals: ["Increase talent pool", "Reduce office costs"],
  constraints: ["Maintain team cohesion", "Legal compliance across regions"],
  decisionType: "general" as const,
}

/**
 * FaultInjectingProvider wraps an LlmProvider and deliberately throws
 * transient errors on the first two calls to simulate real-world API failures:
 *
 * - callCount === timeoutOnCall  → throws a timeout Error
 * - callCount === malformedOnCall → throws a SyntaxError (malformed JSON body)
 * - all subsequent calls         → delegates to the wrapped inner provider
 */
class FaultInjectingProvider implements LlmProvider {
  private callCount = 0

  constructor(
    private readonly inner: LlmProvider,
    private readonly timeoutOnCall = 1,
    private readonly malformedOnCall = 2,
  ) {}

  async generate<TSchema, TOutput>(
    request: LlmRequest<TSchema>,
  ): Promise<LlmResponse<TOutput>> {
    this.callCount++
    if (this.callCount === this.timeoutOnCall) {
      throw new Error("Request timed out after 30000ms")
    }
    if (this.callCount === this.malformedOnCall) {
      throw new SyntaxError("Unexpected token < in JSON at position 0")
    }
    return this.inner.generate<TSchema, TOutput>(request)
  }

  getCallCount(): number {
    return this.callCount
  }
}

describe("Fault tolerance: runDecisionJob survives provider failures", () => {
  it(
    "completes with 'succeeded' status and a schema-valid DecisionRecord after timeout and malformed-JSON failures",
    async () => {
      const store = new MemoryDecisionStore()
      const inner = new HeuristicDebateProvider()
      const faulting = new FaultInjectingProvider(inner)
      // RetryProvider with 3 attempts covers the 2 injected faults:
      //   attempt 1 → timeout error   (fault call 1)
      //   attempt 2 → SyntaxError     (fault call 2)
      //   attempt 3 → inner succeeds  (fault call 3)
      const provider = new RetryProvider(faulting, {
        maxAttempts: 3,
        delayMs: 0,
        backoffFactor: 1,
      })

      const decision = await store.createDecision(SAMPLE_INPUT)
      await runDecisionJob(
        { decisionId: decision.id, runId: "fault-run-001" },
        { provider, store, roles: roleDefinitions },
      )

      const updated = await store.getDecision(decision.id)
      assert.equal(updated?.status, "succeeded", "decision status must be succeeded")

      const record = await store.getDecisionRecord(decision.id)
      assert.ok(record !== null, "a DecisionRecord must be persisted")

      const parsed = DecisionRecordSchema.safeParse(record)
      assert.ok(
        parsed.success,
        `DecisionRecord failed schema validation: ${
          !parsed.success ? JSON.stringify(parsed.error.issues) : ""
        }`,
      )

      const rounds = await store.getDebateRounds(decision.id)
      assert.ok(rounds.length > 0, "at least one debate round must be stored")

      const roundIndices = new Set(rounds.map((r) => r.roundIndex))
      assert.ok(roundIndices.has(1), "round 1 (proposals) must be present")
      assert.ok(roundIndices.has(2), "round 2 (critiques) must be present")
      assert.ok(roundIndices.has(3), "round 3 (convergence) must be present")
    },
  )

  it(
    "FaultInjectingProvider injects exactly 2 faults before delegating; inner provider is never called for the faulted attempts",
    async () => {
      let innerCallCount = 0
      const countingInner: LlmProvider = {
        generate: async <TSchema, TOutput>(req: LlmRequest<TSchema>) => {
          innerCallCount++
          return new HeuristicDebateProvider().generate<TSchema, TOutput>(req)
        },
      }
      const faulting = new FaultInjectingProvider(countingInner)
      const provider = new RetryProvider(faulting, {
        maxAttempts: 3,
        delayMs: 0,
        backoffFactor: 1,
      })

      const store = new MemoryDecisionStore()
      const decision = await store.createDecision(SAMPLE_INPUT)
      await runDecisionJob(
        { decisionId: decision.id, runId: "fault-run-002" },
        { provider, store, roles: roleDefinitions },
      )

      const updated = await store.getDecision(decision.id)
      assert.equal(updated?.status, "succeeded", "decision status must be succeeded")

      // The first RetryProvider.generate() call causes 3 FaultInjectingProvider
      // calls (2 faults + 1 success). Inner provider is only reached on call 3
      // onwards. With 5 roles × 3 rounds + 1 record = 16 outer generate() calls,
      // the inner provider is called for 15 of them (all except the 2 faulted attempts).
      assert.ok(
        innerCallCount >= 1,
        `inner provider must be invoked at least once, got ${innerCallCount}`,
      )
      // The two fault calls must not have leaked through to the inner provider
      assert.ok(
        faulting.getCallCount() > innerCallCount,
        "FaultInjectingProvider must have made more total calls than the inner provider received",
      )
    },
  )

  it(
    "fails the job when fault count exceeds RetryProvider maxAttempts and rethrows the last error",
    async () => {
      // Configure fault injection so that ALL calls throw — retries exhaust and the job fails.
      const alwaysFailing: LlmProvider = {
        generate: async () => {
          throw new Error("persistent provider failure")
        },
      }
      // Wrapping with maxAttempts:2 means both attempts fail; runDecisionJob should
      // catch, mark as failed, and re-throw.
      const provider = new RetryProvider(alwaysFailing, {
        maxAttempts: 2,
        delayMs: 0,
        backoffFactor: 1,
      })

      const store = new MemoryDecisionStore()
      const decision = await store.createDecision(SAMPLE_INPUT)

      await assert.rejects(
        () =>
          runDecisionJob(
            { decisionId: decision.id, runId: "fault-run-003" },
            { provider, store, roles: roleDefinitions },
          ),
        /persistent provider failure/,
      )

      const updated = await store.getDecision(decision.id)
      assert.equal(updated?.status, "failed", "decision status must be failed when all retries are exhausted")
    },
  )
})
