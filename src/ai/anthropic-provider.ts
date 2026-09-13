import { BadRequestError } from "../core"
import { LlmProvider, LlmRequest, LlmResponse } from "./types"

export type AnthropicProviderOptions = {
  apiKey?: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
  maxTokens?: number
}

const parseOutput = (raw: string, schema: unknown): unknown => {
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new BadRequestError("Model output was not valid JSON") }
  return schema && typeof (schema as { parse?: unknown }).parse === "function"
    ? (schema as { parse: (input: unknown) => unknown }).parse(value) : value
}

export const createAnthropicProvider = (options: AnthropicProviderOptions = {}): LlmProvider => {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required")
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"
  const baseUrl = options.baseUrl ?? "https://api.anthropic.com/v1/messages"

  return { async generate<TSchema, TOutput>(request: LlmRequest<TSchema>): Promise<LlmResponse<TOutput>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60000)
    try {
      const response = await fetch(baseUrl, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: options.maxTokens ?? 4096, system: request.system,
          messages: [{ role: "user", content: request.prompt }] }),
      })
      if (!response.ok) throw new Error(`Anthropic request failed: ${response.status} ${await response.text()}`)
      const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> }
      const raw = payload.content?.filter(part => part.type === "text").map(part => part.text ?? "").join("") ?? ""
      if (!raw) throw new Error("Anthropic response missing output text")
      return { output: parseOutput(raw, request.schema) as TOutput, raw, model }
    } finally { clearTimeout(timer) }
  } }
}
