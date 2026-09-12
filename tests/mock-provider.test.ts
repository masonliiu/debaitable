import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { StaticLlmProvider } from "../src/ai/mock-provider.js"
import type { LlmRequest, LlmResponse } from "../src/ai/types.js"

const makeRequest = (): LlmRequest<null> => ({
  system: "sys",
  prompt: "prompt",
  schema: null,
})

const makeResponse = (value: unknown, model = "mock-model"): LlmResponse<unknown> => ({
  output: value,
  raw: JSON.stringify(value),
  model,
})

describe("StaticLlmProvider", () => {
  it("returns responses in FIFO order across consecutive generate() calls", async () => {
    const r1 = makeResponse({ step: 1 })
    const r2 = makeResponse({ step: 2 })
    const r3 = makeResponse({ step: 3 })

    const provider = new StaticLlmProvider([r1, r2, r3])

    const first = await provider.generate(makeRequest())
    assert.deepEqual(first.output, { step: 1 })
    assert.equal(first.model, "mock-model")

    const second = await provider.generate(makeRequest())
    assert.deepEqual(second.output, { step: 2 })

    const third = await provider.generate(makeRequest())
    assert.deepEqual(third.output, { step: 3 })
  })

  it("throws 'StaticLlmProvider: no responses left' when all responses are consumed", async () => {
    const provider = new StaticLlmProvider([makeResponse({ only: true })])

    await provider.generate(makeRequest())

    await assert.rejects(
      () => provider.generate(makeRequest()),
      (err: Error) => {
        assert.equal(err.message, "StaticLlmProvider: no responses left")
        return true
      }
    )
  })
})
