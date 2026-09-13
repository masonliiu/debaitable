import { BadRequestError } from "../core"
import { LlmProvider, LlmRequest, LlmResponse } from "./types"

export type OpenAiCompatibleProviderOptions = {
  /** API key for hosted compatible endpoints; omitted for local servers. */
  apiKey?: string
  model?: string
  /** Base URL, `/v1`, or the complete `/chat/completions` endpoint. */
  baseUrl?: string
  timeoutMs?: number
  maxTokens?: number
}

const DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1"

const isZodSchema = (schema: unknown): schema is { parse: (value: unknown) => unknown } =>
  Boolean(schema && typeof (schema as { parse: unknown }).parse === "function")

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    throw new BadRequestError("Model output was not valid JSON")
  }
}

const endpointFor = (baseUrl: string): string => {
  const normalized = baseUrl.replace(/\/+$/, "")
  return /\/chat\/completions$/i.test(normalized)
    ? normalized
    : `${normalized}/chat/completions`
}

const contentText = (content: unknown): string => {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content.map((part) => {
    if (typeof part === "string") return part
    if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
      return (part as { text: string }).text
    }
    return ""
  }).join("")
}

const getOutputText = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") {
    throw new Error("OpenAI-compatible response payload missing")
  }
  const choices = (payload as {
    choices?: Array<{ message?: { content?: unknown }; text?: unknown }>
  }).choices
  const first = Array.isArray(choices) ? choices[0] : undefined
  const messageText = contentText(first?.message?.content)
  if (messageText) return messageText
  if (typeof first?.text === "string" && first.text) return first.text
  throw new Error("OpenAI-compatible response missing choices[0] output text")
}

export const createOpenAiCompatibleProvider = (
  options: OpenAiCompatibleProviderOptions = {}
): LlmProvider => {
  const model = options.model ?? process.env.GENERIC_OPENAI_MODEL ?? "local-model"
  const baseUrl = endpointFor(options.baseUrl ?? process.env.GENERIC_OPENAI_BASE_URL ?? DEFAULT_BASE_URL)
  const apiKey = options.apiKey ?? process.env.GENERIC_OPENAI_API_KEY
  const timeoutMs = options.timeoutMs ?? 60000

  return {
    async generate<TSchema, TOutput>(
      request: LlmRequest<TSchema>
    ): Promise<LlmResponse<TOutput>> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`
        const response = await fetch(baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.prompt },
            ],
            ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
          }),
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`OpenAI-compatible request failed: ${response.status} ${await response.text()}`)
        }
        const payload = await response.json() as unknown
        const raw = getOutputText(payload)
        const parsed = parseJson(raw)
        const output = (isZodSchema(request.schema) ? request.schema.parse(parsed) : parsed) as TOutput
        return { output, raw, model }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
