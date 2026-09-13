import { BadRequestError } from "../core"
import { LlmProvider, LlmRequest, LlmResponse } from "./types"

export type OllamaProviderOptions = { model?: string; baseUrl?: string; timeoutMs?: number }

const parseOutput = (raw: string, schema: unknown): unknown => {
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new BadRequestError("Model output was not valid JSON") }
  return schema && typeof (schema as { parse?: unknown }).parse === "function"
    ? (schema as { parse: (input: unknown) => unknown }).parse(value) : value
}

export const createOllamaProvider = (options: OllamaProviderOptions = {}): LlmProvider => {
  const model = options.model ?? process.env.OLLAMA_MODEL ?? "qwen3:8b"
  const baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "")
  return { async generate<TSchema, TOutput>(request: LlmRequest<TSchema>): Promise<LlmResponse<TOutput>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60000)
    try {
      const response = await fetch(`${baseUrl}/api/chat`, { method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, stream: false, format: "json", messages: [
          { role: "system", content: request.system }, { role: "user", content: request.prompt },
        ] }) })
      if (!response.ok) throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`)
      const payload = await response.json() as { message?: { content?: string } }
      const raw = payload.message?.content ?? ""
      if (!raw) throw new Error("Ollama response missing output text")
      return { output: parseOutput(raw, request.schema) as TOutput, raw, model }
    } finally { clearTimeout(timer) }
  } }
}
