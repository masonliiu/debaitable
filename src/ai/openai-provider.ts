import { BadRequestError } from "../core"
import { LlmProvider, LlmRequest, LlmResponse } from "./types"

export type OpenAiProviderOptions = {
  apiKey?: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1/responses"

const isZodSchema = (schema: unknown): schema is { parse: (value: unknown) => unknown } =>
  Boolean(schema && typeof (schema as { parse: unknown }).parse === "function")

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new BadRequestError("Model output was not valid JSON")
  }
}

const getOutputText = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") {
    throw new Error("OpenAI response payload missing")
  }
  const data = payload as {
    output_text?: string[]
    output?: { type?: string; content?: { type?: string; text?: string }[] }[]
    text?: string
  }
  if (Array.isArray(data.output_text) && data.output_text.length > 0) {
    return data.output_text.join("")
  }
  if (Array.isArray(data.output)) {
    const parts: string[] = []
    for (const item of data.output) {
      if (item.type !== "message" || !Array.isArray(item.content)) {
        continue
      }
      for (const content of item.content) {
        if (content.type === "output_text" && content.text) {
          parts.push(content.text)
        }
      }
    }
    if (parts.length > 0) {
      return parts.join("")
    }
  }
  if (typeof data.text === "string" && data.text.length > 0) {
    return data.text
  }
  throw new Error("OpenAI response missing output text")
}

export const createOpenAiProvider = (
  options: OpenAiProviderOptions = {}
): LlmProvider => {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required")
  }
  const model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-5"
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const timeoutMs = options.timeoutMs ?? 60000

  return {
    async generate<TSchema, TOutput>(
      request: LlmRequest<TSchema>
    ): Promise<LlmResponse<TOutput>> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetch(baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: [
              { role: "system", content: request.system },
              { role: "user", content: request.prompt },
            ],
            temperature: 0,
          }),
          signal: controller.signal,
        })
        if (!response.ok) {
          const message = await response.text()
          throw new Error(`OpenAI request failed: ${response.status} ${message}`)
        }
        const payload = (await response.json()) as unknown
        const text = getOutputText(payload)
        const json = parseJson(text)
        const output = (isZodSchema(request.schema)
          ? request.schema.parse(json)
          : json) as TOutput
        return {
          output,
          raw: text,
          model,
        }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
