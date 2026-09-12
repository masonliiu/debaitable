import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { HeuristicDebateProvider } from "../src/ai/heuristic-provider.js"
import type { LlmRequest } from "../src/ai/types.js"

const VALID_INPUT = JSON.stringify({
  title: "Test Decision",
  context: "Should we proceed?",
  goals: ["Improve efficiency"],
  constraints: ["Limited budget"],
  decisionType: "general",
})

const makeRequest = (overrides: Partial<LlmRequest<null>> = {}): LlmRequest<null> => ({
  system: "You are a debate participant.",
  prompt: `Decision input:\n${VALID_INPUT}\n\nTask: Provide an independent proposal.`,
  schema: null,
  ...overrides,
})

describe("HeuristicDebateProvider", () => {
  it("throws when the prompt lacks the 'Decision input:\\n' marker", async () => {
    const provider = new HeuristicDebateProvider()
    const request = makeRequest({ prompt: "No marker here. Task: Provide an independent proposal." })
    await assert.rejects(
      () => provider.generate(request),
      (err: Error) => {
        assert.match(err.message, /missing decision input/i)
        return true
      }
    )
  })

  it("infers 'proposal' round from prompt text", async () => {
    const provider = new HeuristicDebateProvider()
    const result = await provider.generate(makeRequest({
      prompt: `Decision input:\n${VALID_INPUT}\n\nTask: Provide an independent proposal.`,
    }))
    const output = result.output as Record<string, unknown>
    assert.ok("summary" in output || "roleKey" in output, "output has proposal shape")
    assert.equal(typeof (output as { roleKey: unknown }).roleKey, "string")
  })

  it("infers 'critique' round from prompt text", async () => {
    const provider = new HeuristicDebateProvider()
    const result = await provider.generate(makeRequest({
      prompt: `Decision input:\n${VALID_INPUT}\n\nTask: Provide critiques and rebuttals for current proposals.`,
    }))
    const output = result.output as Record<string, unknown>
    assert.ok(Array.isArray((output as { critiques: unknown }).critiques), "output has critiques array")
  })

  it("infers 'convergence' round from prompt text", async () => {
    const provider = new HeuristicDebateProvider()
    const result = await provider.generate(makeRequest({
      prompt: `Decision input:\n${VALID_INPUT}\n\nTask: Converge and vote.`,
    }))
    const output = result.output as Record<string, unknown>
    assert.ok("vote" in output, "output has vote field for convergence round")
  })

  it("populates roleKey and model in the returned LlmResponse", async () => {
    const provider = new HeuristicDebateProvider()
    const prompt = `{"roleKey":"skeptic"} Decision input:\n${VALID_INPUT}\n\nTask: Provide an independent proposal.`
    const result = await provider.generate(makeRequest({ prompt }))
    assert.equal(result.model, "heuristic-v1")
    const output = result.output as { roleKey: string }
    assert.equal(output.roleKey, "skeptic")
  })
})
