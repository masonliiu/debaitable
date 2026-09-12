import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { FallbackProvider, createFallbackProvider } from "../src/ai/fallback-provider.js"
import { StaticLlmProvider } from "../src/ai/mock-provider.js"
import type { LlmResponse } from "../src/ai/types.js"

const fakeResponse: LlmResponse<unknown> = {
  output: { result: "ok" },
  raw: '{"result":"ok"}',
  model: "test-model",
}

const makeRequest = () => ({ system: "sys", prompt: "p", schema: null })

const failingProvider = {
  generate: async () => { throw new Error("provider failed") },
}

describe("FallbackProvider", () => {
  it("returns first provider response when it succeeds", async () => {
    const p1 = new StaticLlmProvider([fakeResponse])
    const p2 = new StaticLlmProvider([{ ...fakeResponse, model: "second" }])
    const provider = new FallbackProvider([p1, p2])
    const result = await provider.generate(makeRequest())
    assert.deepEqual(result, fakeResponse)
  })

  it("falls back to the next provider when the first fails", async () => {
    const secondResponse: LlmResponse<unknown> = { ...fakeResponse, model: "second" }
    const p2 = new StaticLlmProvider([secondResponse])
    const provider = new FallbackProvider([failingProvider, p2])
    const result = await provider.generate(makeRequest())
    assert.deepEqual(result, secondResponse)
  })

  it("skips multiple failing providers and succeeds on a later one", async () => {
    const thirdResponse: LlmResponse<unknown> = { ...fakeResponse, model: "third" }
    const p3 = new StaticLlmProvider([thirdResponse])
    const provider = new FallbackProvider([failingProvider, failingProvider, p3])
    const result = await provider.generate(makeRequest())
    assert.deepEqual(result, thirdResponse)
  })

  it("throws an aggregated error when all providers fail", async () => {
    const p1 = { generate: async () => { throw new Error("err-one") } }
    const p2 = { generate: async () => { throw new Error("err-two") } }
    const provider = new FallbackProvider([p1, p2])
    await assert.rejects(
      () => provider.generate(makeRequest()),
      (err: Error) => {
        assert.match(err.message, /All fallback providers failed/)
        assert.match(err.message, /err-one/)
        assert.match(err.message, /err-two/)
        return true
      }
    )
  })

  it("createFallbackProvider factory returns a working FallbackProvider", async () => {
    const p = new StaticLlmProvider([fakeResponse])
    const provider = createFallbackProvider([p])
    const result = await provider.generate(makeRequest())
    assert.deepEqual(result, fakeResponse)
  })

  it("throws RangeError when constructed with an empty array", () => {
    assert.throws(
      () => new FallbackProvider([]),
      (err: Error) => {
        assert.ok(err instanceof RangeError)
        assert.match(err.message, /at least one provider/)
        return true
      }
    )
  })
})
