import { afterEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { createAnthropicProvider, createGeminiProvider, createOllamaProvider } from "../src/ai/index.js"

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const request = { system: "system", prompt: "prompt", schema: null }

describe("production provider adapters", () => {
  it("formats Anthropic Messages requests and parses content", async () => {
    let url = ""; let init: RequestInit | undefined
    globalThis.fetch = async (input, options) => { url = String(input); init = options; return new Response(
      JSON.stringify({ content: [{ type: "text", text: '{"answer":"anthropic"}' }] }), { status: 200 }) }
    const result = await createAnthropicProvider({ apiKey: "a", model: "claude-test" }).generate(request)
    assert.equal(url, "https://api.anthropic.com/v1/messages")
    assert.equal((init?.headers as Record<string, string>)["x-api-key"], "a")
    assert.deepEqual(JSON.parse(init?.body as string).messages, [{ role: "user", content: "prompt" }])
    assert.deepEqual(result.output, { answer: "anthropic" })
  })

  it("formats Gemini generateContent requests and parses parts", async () => {
    let url = ""; let body: any
    globalThis.fetch = async (input, init) => { url = String(input); body = JSON.parse(init?.body as string); return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"answer":"gemini"}' }] } }] }), { status: 200 }) }
    const result = await createGeminiProvider({ apiKey: "g key", model: "gemini-test" }).generate(request)
    assert.match(url, /models\/gemini-test:generateContent\?key=g%20key$/)
    assert.equal(body.systemInstruction.parts[0].text, "system")
    assert.deepEqual(result.output, { answer: "gemini" })
  })

  it("formats local Ollama chat requests and parses message content", async () => {
    let url = ""; let body: any
    globalThis.fetch = async (input, init) => { url = String(input); body = JSON.parse(init?.body as string); return new Response(
      JSON.stringify({ message: { content: '{"answer":"ollama"}' } }), { status: 200 }) }
    const result = await createOllamaProvider({ baseUrl: "http://ollama.test/", model: "qwen" }).generate(request)
    assert.equal(url, "http://ollama.test/api/chat")
    assert.equal(body.stream, false)
    assert.equal(body.format, "json")
    assert.deepEqual(result.output, { answer: "ollama" })
  })
})
