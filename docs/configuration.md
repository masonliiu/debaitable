# DebAItable Configuration

This document explains how to configure model providers, environment variables, and consensus strategies for DebAItable.

## Provider Assignments

DebAItable selects one model adapter per debate role via the provider factory (`src/ai/factory.ts`). Each role can use a different provider and model.

Set `DEBAITABLE_PROVIDER_<ROLE>` to `provider[:model]`. Omit `:model` to use the adapter default. Role names are upper-snake-case:

- `DEBAITABLE_PROVIDER_STRATEGIST`
- `DEBAITABLE_PROVIDER_SKEPTIC`
- `DEBAITABLE_PROVIDER_RISK_ANALYST`
- `DEBAITABLE_PROVIDER_EXECUTION_PLANNER`
- `DEBAITABLE_PROVIDER_COST_ROI`

Supported provider keys:

- `openai` — OpenAI chat completions (`src/ai/openai-provider.ts`)
- `generic` / `openai-compatible` — any OpenAI-compatible `/v1/chat/completions` server (`src/ai/openai-compatible-provider.ts`), e.g. LM Studio, vLLM, llama.cpp, hosted gateways
- `anthropic` — Anthropic messages API (`src/ai/anthropic-provider.ts`)
- `gemini` — Google Gemini API (`src/ai/gemini-provider.ts`)
- `ollama` — local Ollama chat API (`src/ai/ollama-provider.ts`)
- `heuristic` — deterministic local fallback with no network calls (`src/ai/heuristic-provider.ts`)

Aliases: `generic` and `openai-compatible` resolve to the same adapter. Provider keys are case-insensitive and surrounding whitespace is trimmed.

Example:

```bash
export DEBAITABLE_PROVIDER_STRATEGIST="anthropic:claude-sonnet-4-6"
export DEBAITABLE_PROVIDER_SKEPTIC="gemini:gemini-2.5-flash"
export DEBAITABLE_PROVIDER_RISK_ANALYST="ollama:qwen3:8b"
export DEBAITABLE_PROVIDER_EXECUTION_PLANNER="generic:qwen2.5-coder"
export DEBAITABLE_PROVIDER_COST_ROI="openai:gpt-5"
npm run cli
```

Roles without an override use the provider selected in the TUI / CLI runtime. If no cloud credentials are present, the CLI falls back to the deterministic `heuristic` provider.

### Resilience wrappers

All selected providers are wrapped automatically (see `src/ai/retry-provider.ts` and `src/ai/fallback-provider.ts`):

- `retry` — deterministic retries for transient failures.
- `fallback` — falls back to the heuristic provider when the primary adapter fails or returns non-conforming output.
- `mock` (`src/ai/mock-provider.ts`) is reserved for tests and never selected by default.

All adapter outputs are validated with Zod (`src/ai/schemas.ts`, `src/ai/validate.ts`, `src/core/validate.ts`). Non-conforming results are rejected before orchestration proceeds.

## Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | Enables the `openai` adapter. If omitted, CLI uses heuristic mode. | _(unset)_ |
| `OPENAI_MODEL` | Default model for the `openai` adapter. | `gpt-5` |
| `OPENAI_BASE_URL` | Override OpenAI-compatible base URL for the `openai` adapter. | OpenAI default |
| `ANTHROPIC_API_KEY` | Enables the `anthropic` adapter. | _(unset)_ |
| `ANTHROPIC_MODEL` | Default model for the `anthropic` adapter. | adapter default |
| `ANTHROPIC_BASE_URL` | Override Anthropic base URL. | Anthropic default |
| `GEMINI_API_KEY` | Enables the `gemini` adapter. | _(unset)_ |
| `GEMINI_MODEL` | Default model for the `gemini` adapter. | adapter default |
| `GEMINI_BASE_URL` | Override Gemini base URL. | Gemini default |
| `GENERIC_OPENAI_BASE_URL` | Base URL for the `generic` / `openai-compatible` adapter. | `http://127.0.0.1:1234/v1` |
| `GENERIC_OPENAI_API_KEY` | Optional bearer token for the generic endpoint. No `Authorization` header is sent unless set. | _(unset)_ |
| `GENERIC_OPENAI_MODEL` | Default model for the generic adapter when `:model` is omitted. | adapter default |
| `OLLAMA_BASE_URL` | Base URL for the `ollama` adapter. | `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Default model for the `ollama` adapter. | adapter default |
| `DEBAITABLE_PROVIDER_<ROLE>` | Per-role `provider[:model]` assignment (see above). | TUI selection |
| `DEBAITABLE_CONSENSUS_STRATEGY` | Default consensus strategy: `equal` or `confidence-weighted`. | `equal` |
| `DEBAITABLE_DATA_DIR` | Directory path for durable filesystem persistence (`FsStore`) and queue (`FsQueue`). If unset, in-memory implementations are used. | _(unset)_ |

Notes:

- Secrets must only be provided via environment variables; never commit keys or tokens.
- Cloud adapters require their respective `*_API_KEY`; local adapters (`heuristic`, `ollama`, `generic` against localhost) work without keys.
- User decision input is sanitized (`src/core/sanitize.ts`) before prompt injection. Avoid storing raw prompt content; minimal PII is persisted.
- Setting `DEBAITABLE_DATA_DIR` enables state recovery across server restarts for the HTTP API microservice.

## Durable Microservice Storage (`DEBAITABLE_DATA_DIR`)

By default, the HTTP API microservice (`npm run serve`) uses in-memory state (`MemoryStore` and `MemoryQueue`), so decisions and queue jobs are lost when the server restarts.

Setting `DEBAITABLE_DATA_DIR` enables durable filesystem-backed persistence:

```bash
export DEBAITABLE_DATA_DIR="./data"
npm run serve
```

When configured:
- **`FsStore` (`FsDecisionStore`)**: Durably saves and retrieves `DecisionRecord` objects, decisions, rounds, and run metadata as JSON files on disk.
- **`FsQueue` (`FsDecisionQueue`)**: Tracks job payloads and states (`queued`, `active`, `completed`, `failed`) on disk.
- **Crash Recovery**: On startup, `FsQueue` detects jobs left in the `active` state from a previous crashed run and automatically recovers them (requeuing or marking as failed), ensuring no jobs are permanently lost or stuck.

Example running on a custom port with persistent storage:

```bash
DEBAITABLE_DATA_DIR=/var/lib/debaitable npm run serve -- --port 4001
```

## Consensus Strategies

Vote aggregation lives in `src/orchestration/votes.ts` and synthesis in `src/orchestration/synthesize.ts`. Every saved artifact records the strategy used.

- `equal` — one-role-one-vote majority. Simplest to reason about; best default for small or evenly trusted role sets.
- `confidence-weighted` — each role vote is weighted by its reported confidence. Rewards high-confidence convergence and dampens low-confidence outliers.

Selection order:

1. Interactive toggle: press `c` in the TUI to switch strategies at runtime.
2. Startup default: `DEBAITABLE_CONSENSUS_STRATEGY=confidence-weighted` makes weighted voting the initial selection; any other value (or unset) starts with `equal`.
3. Persisted artifact: the chosen strategy is written into the Decision Record artifact under `artifacts/`.

Example:

```bash
export DEBAITABLE_CONSENSUS_STRATEGY=confidence-weighted
npm run cli
```

## Further Reading

- `docs/architecture.md` — orchestration, API, and persistence layers with Mermaid diagram.
- `README.md` — setup, CLI usage, and install methods.
- `AGENTS.md` — contributor contract and data guarantees.
