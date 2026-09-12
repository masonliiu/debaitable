import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import { createOpenAiProvider } from "../src/ai/openai-provider.js"
import { BadRequestError } from "../src/core/index.js"

type MockFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const makeMockFetch = (status: number, body: unknown, isJson = true): MockFetch =>
  async (_input, _init) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response)

const BASE_OPTIONS = {
  apiKey: "test-key",
  model: "test-model",
  baseUrl: "https://mock.openai.test/v1/responses",
  timeoutMs: 5000,
}

const makeRequest = () => ({
  system: "You are helpful.",
  prompt: "Make a decision.",
  schema: null,
})

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("createOpenAiProvider", () => {
  it("throws when no API key is provided", () => {
    const savedKey = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      assert.throws(
        () => createOpenAiProvider({ model: "m", baseUrl: "http://x" }),
        /OPENAI_API_KEY is required/
      )
    } finally {
      if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey
    }
  })
})

describe("OpenAiProvider.generate – request formatting", () => {
  it("sends POST with correct Content-Type and Authorization headers", async () => {
    let capturedInit: RequestInit | undefined
    let capturedUrl: string | undefined

    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input)
      capturedInit = init
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: ['{"result":"ok"}'] }),
        text: async () => "",
      } as Response
    }

    const provider = createOpenAiProvider(BASE_OPTIONS)
    await provider.generate(makeRequest())

    assert.equal(capturedUrl, BASE_OPTIONS.baseUrl)
    assert.equal(capturedInit?.method, "POST")
    const headers = capturedInit?.headers as Record<string, string>
    assert.equal(headers["Content-Type"], "application/json")
    assert.equal(headers["Authorization"], `Bearer ${BASE_OPTIONS.apiKey}`)
  })

  it("sends model, system role, and user prompt in the body", async () => {
    let capturedBody: unknown

    globalThis.fetch = async (_input, init) => {
      capturedBody = JSON.parse(init?.body as string)
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: ['{"ok":true}'] }),
        text: async () => "",
      } as Response
    }

    const request = makeRequest()
    const provider = createOpenAiProvider(BASE_OPTIONS)
    await provider.generate(request)

    assert.deepEqual(capturedBody, {
      model: BASE_OPTIONS.model,
      input: [
        { role: "system", content: request.system },
        { role: "user", content: request.prompt },
      ],
    })
  })
})

describe("OpenAiProvider.generate – response parsing", () => {
  it("extracts text from output_text array", async () => {
    const inner = '{"answer":42}'
    globalThis.fetch = makeMockFetch(200, { output_text: [inner] })

    const provider = createOpenAiProvider(BASE_OPTIONS)
    const result = await provider.generate(makeRequest())

    assert.deepEqual(result.output, { answer: 42 })
    assert.equal(result.raw, inner)
    assert.equal(result.model, BASE_OPTIONS.model)
  })

  it("extracts text from output[].content[].text (message/output_text structure)", async () => {
    const inner = '{"answer":99}'
    const payload = {
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: inner },
          ],
        },
      ],
    }
    globalThis.fetch = makeMockFetch(200, payload)

    const provider = createOpenAiProvider(BASE_OPTIONS)
    const result = await provider.generate(makeRequest())

    assert.deepEqual(result.output, { answer: 99 })
    assert.equal(result.raw, inner)
  })

  it("extracts text from top-level text field", async () => {
    const inner = '{"x":7}'
    globalThis.fetch = makeMockFetch(200, { text: inner })

    const provider = createOpenAiProvider(BASE_OPTIONS)
    const result = await provider.generate(makeRequest())

    assert.deepEqual(result.output, { x: 7 })
    assert.equal(result.raw, inner)
  })

  it("joins multiple output_text entries", async () => {
    const part1 = '{"a":'
    const part2 = '1}'
    globalThis.fetch = makeMockFetch(200, { output_text: [part1, part2] })

    const provider = createOpenAiProvider(BASE_OPTIONS)
    const result = await provider.generate(makeRequest())

    assert.deepEqual(result.output, { a: 1 })
  })

  it("applies a Zod schema when provided", async () => {
    const { z } = await import("zod")
    const MySchema = z.object({ name: z.string() })
    globalThis.fetch = makeMockFetch(200, { output_text: ['{"name":"Alice"}'] })

    const provider = createOpenAiProvider(BASE_OPTIONS)
    const result = await provider.generate({ ...makeRequest(), schema: MySchema })

    assert.deepEqual(result.output, { name: "Alice" })
  })
})

describe("OpenAiProvider.generate – error handling", () => {
  it("throws BadRequestError when model output is not valid JSON", async () => {
    globalThis.fetch = makeMockFetch(200, { output_text: ["not valid json {{"] })

    const provider = createOpenAiProvider(BASE_OPTIONS)
    await assert.rejects(
      () => provider.generate(makeRequest()),
      (err: Error) => {
        assert.equal(err.name, "BadRequestError")
        assert.match(err.message, /not valid JSON/i)
        return true
      }
    )
  })

  it("throws Error with status code when HTTP response is not OK", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      text: async () => "Rate limit exceeded",
      json: async () => ({}),
    } as Response)

    const provider = createOpenAiProvider(BASE_OPTIONS)
    await assert.rejects(
      () => provider.generate(makeRequest()),
      (err: Error) => {
        assert.match(err.message, /429/)
        assert.match(err.message, /Rate limit exceeded/)
        return true
      }
    )
  })

  it("throws Error with status code for a 500 response", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
      json: async () => ({}),
    } as Response)

    const provider = createOpenAiProvider(BASE_OPTIONS)
    await assert.rejects(
      () => provider.generate(makeRequest()),
      (err: Error) => {
        assert.match(err.message, /500/)
        assert.match(err.message, /Internal Server Error/)
        return true
      }
    )
  })
})
