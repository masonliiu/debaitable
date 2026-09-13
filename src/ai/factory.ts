import { createAnthropicProvider } from "./anthropic-provider"
import { createGeminiProvider } from "./gemini-provider"
import { HeuristicDebateProvider } from "./heuristic-provider"
import { createOllamaProvider } from "./ollama-provider"
import { createOpenAiProvider } from "./openai-provider"
import { LlmProvider } from "./types"

export type ProviderKind = "openai" | "anthropic" | "gemini" | "ollama" | "heuristic"

export const createProvider = (spec: string): LlmProvider => {
  const [rawKind, ...modelParts] = spec.trim().split(":")
  const kind = rawKind.toLowerCase()
  const model = modelParts.join(":") || undefined
  switch (kind) {
    case "openai": return createOpenAiProvider({ model })
    case "anthropic": return createAnthropicProvider({ model })
    case "gemini": return createGeminiProvider({ model })
    case "ollama": return createOllamaProvider({ model })
    case "heuristic": return new HeuristicDebateProvider()
    default: throw new Error(`Unsupported provider: ${rawKind}`)
  }
}
