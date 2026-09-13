import { BadRequestError } from "../core"
import { LlmProvider, LlmRequest, LlmResponse } from "./types"

export type GeminiProviderOptions = { apiKey?: string; model?: string; baseUrl?: string; timeoutMs?: number }

const parseOutput = (raw: string, schema: unknown): unknown => {
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new BadRequestError("Model output was not valid JSON") }
  return schema && typeof (schema as { parse?: unknown }).parse === "function"
    ? (schema as { parse: (input: unknown) => unknown }).parse(value) : value
}

export const createGeminiProvider = (options: GeminiProviderOptions = {}): LlmProvider => {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is required")
  const model = options.model ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash"
  const root = (options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "")
  return { async generate<TSchema, TOutput>(request: LlmRequest<TSchema>): Promise<LlmResponse<TOutput>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60000)
    try {
      const url = `${root}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
      const response = await fetch(url, { method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: "user", parts: [{ text: request.prompt }] }],
          generationConfig: { responseMimeType: "application/json" } }) })
      if (!response.ok) throw new Error(`Gemini request failed: ${response.status} ${await response.text()}`)
      const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      const raw = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("") ?? ""
      if (!raw) throw new Error("Gemini response missing output text")
      return { output: parseOutput(raw, request.schema) as TOutput, raw, model }
    } finally { clearTimeout(timer) }
  } }
}
