# DebAItable

DebAItable is an artifact-first multi-agent decision engine. Instead of free-form chat, it runs
structured debate rounds and outputs a Decision Record plus an audit trail of all role outputs.

## What It Does
- Runs a 3-round debate pipeline:
  - Round 1: independent proposals per role
  - Round 2: critiques and rebuttals
  - Round 3: convergence vote
- Produces a structured `DecisionRecord`:
  - summary, rationale, tradeoffs, risks, actions, confidence, minority report
  - executive decision block (`decision`, `why`, top risks/actions, stop/go criteria)
- Stores all rounds and run states in a persistence layer
- Supports OpenAI-backed generation and deterministic local heuristic mode
- Includes an interactive TUI CLI that saves JSON artifacts under `artifacts/`
 - Uses one-message decision intake by default, with optional guided edit only when needed
 - Applies normalization + quality gates to keep output concise, non-duplicative, and usable

## Current Architecture
1. API service validates and sanitizes decision input.
2. Decision is persisted and enqueued as a background-style job payload.
3. Job runner executes orchestration rounds via role prompts.
4. Outputs are schema-validated with Zod at each boundary.
5. Final record and full round audit trail are stored and returned.

## Run It

### Assign different models to debate roles

Set `DEBAITABLE_PROVIDER_<ROLE>` to `provider:model`. Omit `:model` to use the
adapter default. Available providers are `openai`, `generic` (or
`openai-compatible`), `anthropic`, `gemini`, `ollama`, and `heuristic`.

```bash
export DEBAITABLE_PROVIDER_STRATEGIST="anthropic:claude-sonnet-4-6"
export DEBAITABLE_PROVIDER_SKEPTIC="gemini:gemini-2.5-flash"
export DEBAITABLE_PROVIDER_RISK_ANALYST="ollama:qwen3:8b"
npm run cli
```

The `generic` adapter targets any OpenAI-compatible `/v1/chat/completions`
server, including LM Studio, vLLM, llama.cpp, and compatible hosted gateways.
It defaults to the local `http://127.0.0.1:1234/v1` endpoint and does not send an
Authorization header unless `GENERIC_OPENAI_API_KEY` is set:

```bash
export GENERIC_OPENAI_BASE_URL="http://127.0.0.1:1234/v1"
export DEBAITABLE_PROVIDER_STRATEGIST="generic:qwen2.5-coder"
```

Cloud adapters read `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`.
Ollama defaults to `http://127.0.0.1:11434`; override it with
`OLLAMA_BASE_URL`. Roles without an override use the provider selected in the
TUI.

Press `c` in the TUI to switch between equal voting and confidence-weighted
consensus. Set `DEBAITABLE_CONSENSUS_STRATEGY=confidence-weighted` to make the
weighted strategy the startup default. Every saved artifact records the chosen
strategy.

1. Install dependencies:
   - `npm install`
2. Optional environment:
   - `OPENAI_API_KEY` (if omitted, CLI uses deterministic heuristic provider)
   - `OPENAI_MODEL` (default: `gpt-5`)
3. Run demo:
   - `npm run dev`
4. Run interactive TUI:
   - `npm run cli`
   - Keyboard-first full-screen workflow:
     - Type a prompt/question in the left input pane and press `Enter` to run
     - Arrow keys move focus between prompt/history/output panes
     - `a` toggles audit timeline
     - `m` switches model mode (OpenAI/heuristic when API key is present)
     - `c` switches equal/confidence-weighted consensus
     - `?` opens compact help
5. Typecheck:
   - `npm run typecheck`

## Install Methods For Users

### 1) npm global install
1. Install:
   - `npm i -g debaitable`
2. Run:
   - `debaitable`

If `debaitable` is not found after install:
- Add npm global bin to PATH (zsh):
  - `echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.zshrc`
  - `source ~/.zshrc`

### 2) npx / npm exec (no global install)
- `npx debaitable`
- or `npm exec debaitable`

### 3) curl installer
- `curl -fsSL https://raw.githubusercontent.com/masonliiu/debaitable/master/scripts/install.sh | bash`

This installs `debaitable` globally with npm and prints PATH instructions if needed.

### 4) Homebrew tap install (today)
- `brew tap masonliiu/debaitable`
- `brew install debaitable`

Note:
- `brew install debaitable` without tapping works only after acceptance into `homebrew-core`.

### 5) Homebrew core install (future)
- Target command after merge to core:
  - `brew install debaitable`

## CLI + Web In One Repo
- Keep CLI source under `src/` and future web frontend under `web/`.
- npm publish only ships files listed in `package.json -> files`, so web code stays out of the npm package.
- Use:
  - `npm run build:cli` for npm release artifacts
  - `npm run build:web` for website deploy artifacts (when `web/` is set up)
  - `npm run build` defaults to CLI build

## Repository Scope (Today)
- Engine modules under `src/`:
  - `core`, `api`, `orchestration`, `jobs`, `persistence`, `ai`, `cli`
- Frontend workspace under `web/` (scaffolded; framework can be added later)
- In-memory queue and store are the default runtime adapters.
- No web UI or external DB wiring in this repo yet.

## License
MIT. See `LICENSE`.
