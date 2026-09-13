import { createAnthropicProvider } from "./anthropic-provider"
import { createGeminiProvider } from "./gemini-provider"
import { HeuristicDebateProvider } from "./heuristic-provider"
import { createOllamaProvider } from "./ollama-provider"
import { createOpenAiProvider } from "./openai-provider"
import { LlmProvider } from "./types"

export type ProviderKind = "openai" | "anthropic" | "gemini" | "ollama" | "heuristic"

export const createProvider = (kind: string): LlmProvider => {
  switch (kind.trim().toLowerCase()) {
    case "openai": return createOpenAiProvider()
    case "anthropic": return createAnthropicProvider()
    case "gemini": return createGeminiProvider()
    case "ollama": return createOllamaProvider()
    case "heuristic": return new HeuristicDebateProvider()
    default: throw new Error(`Unsupported provider: ${kind}`)
  }
}
