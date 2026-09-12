import { describe, it, mock } from "node:test"
import assert from "node:assert/strict"
import { RetryProvider } from "../src/ai/retry-provider.js"
import type { LlmProvider, LlmRequest, LlmResponse } from "../src/ai/types.js"

const fakeResponse: LlmResponse<unknown> = {
  output: { result: "ok" },
  raw: '{"result":"ok"}',
  model: "test-model",
}

const makeRequest = (): LlmRequest<null> => ({
  system: "sys",
  prompt: "prompt",
  schema: null,
})

// Zero-delay helper so tests run fast
const fastOptions = { delayMs: 0, backoffFactor: 1 }

describe("RetryProvider", () => {
  it("returns the inner provider's response on first success", async () => {
    const inner: LlmProvider = {
      generate: async () => fakeResponse,
    }
    const provider = new RetryProvider(inner, { maxAttempts: 3, ...fastOptions })
    const result = await provider.generate(makeRequest())
    assert.deepEqual(result, fakeResponse)
  })

  it("retries and succeeds on the second attempt", async () => {
    let calls = 0
    const inner: LlmProvider = {
      generate: async () => {
        calls++
        if (calls === 1) throw new Error("transient failure")
        return fakeResponse
      },
    }
    const provider = new RetryProvider(inner, { maxAttempts: 3, ...fastOptions })
    const result = await provider.generate(makeRequest())
    assert.deepEqual(result, fakeResponse)
    assert.equal(calls, 2)
  })

  it("throws after exhausting all attempts", async () => {
    let calls = 0
    const inner: LlmProvider = {
      generate: async () => {
        calls++
        throw new Error(`failure #${calls}`)
      },
    }
    const provider = new RetryProvider(inner, { maxAttempts: 3, ...fastOptions })
    await assert.rejects(
      () => provider.generate(makeRequest()),
      (err: Error) => {
        assert.equal(err.message, "failure #3")
        return true
      }
    )
    assert.equal(calls, 3)
  })

  it("does not retry when maxAttempts is 1", async () => {
    let calls = 0
    const inner: LlmProvider = {
      generate: async () => {
        calls++
        throw new Error("immediate failure")
      },
    }
    const provider = new RetryProvider(inner, { maxAttempts: 1, ...fastOptions })
    await assert.rejects(() => provider.generate(makeRequest()), /immediate failure/)
    assert.equal(calls, 1)
  })

  it("uses exponential backoff between attempts", async () => {
    const delays: number[] = []
    const originalSetTimeout = globalThis.setTimeout
    // Monkeypatch sleep by overriding setTimeout temporarily
    let callCount = 0
    const inner: LlmProvider = {
      generate: async () => {
        callCount++
        if (callCount < 3) throw new Error("fail")
        return fakeResponse
      },
    }
    // Use real timing but tiny base delay to verify factor application
    const provider = new RetryProvider(inner, {
      maxAttempts: 3,
      delayMs: 1,
      backoffFactor: 4,
    })
    const start = Date.now()
    await provider.generate(makeRequest())
    const elapsed = Date.now() - start
    // Two sleeps: 1ms then 4ms = at least 5ms
    assert.ok(elapsed >= 4, `expected elapsed >= 4ms but got ${elapsed}ms`)
    assert.equal(callCount, 3)
  })
})
