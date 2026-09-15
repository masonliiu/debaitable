# DebAItable

[![CI](https://github.com/masonliiu/debaitable/actions/workflows/ci.yml/badge.svg)](https://github.com/masonliiu/debaitable/actions/workflows/ci.yml)
[![Release](https://github.com/masonliiu/debaitable/actions/workflows/release.yml/badge.svg)](https://github.com/masonliiu/debaitable/actions/workflows/release.yml)

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

When one role adapter times out, returns malformed data, or is unauthorized,
the runner isolates that role and continues with the surviving roles. A
completed degraded run is marked with `debateStatus: "degraded"` and persists
the failed `roleKey`, `provider`, `model`, error `kind`, retry count, fallback
usage, and the selected consensus strategy in run metadata. If every role in a
round fails, the job fails explicitly instead of manufacturing a consensus.

## Documentation
- [Architecture](docs/architecture.md) — orchestration, API, and persistence layers with Mermaid diagram.
- [Configuration](docs/configuration.md) — provider assignments, environment variables, and consensus strategies.
- [Limitations](docs/limitations.md) — real-world performance limitations of consensus vs. individual models.
- Continuous integration runs `npm ci`, `npm run typecheck`, and `npm test` on push and pull requests via `.github/workflows/ci.yml`.
- Automated releases are published to NPM and GitHub Releases when a `v*` tag is pushed, via `.github/workflows/release.yml`.

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
     - A degraded result is labeled in the output pane with each failed role
       and error kind; surviving positions and the minority report remain
       visible.
     - `?` opens compact help
5. Typecheck:
   - `npm run typecheck`

### Serve the HTTP API as a microservice

Start the HTTP API server backed by `src/api/http.ts` and `src/api/service.ts`
(in-memory store and queue by default):

```bash
npm run serve
npm run serve -- --port 4001
node dist/main.js serve --port 4001
```

Port options (default `3000`):

- `npm run serve -- --port 4001`
- `npm run serve -- -p 4001`
- `npm run serve -- --port=4001`

Submit a decision payload to the local endpoint:

```bash
curl -X POST http://localhost:3000/decisions \
  -H 'Content-Type: application/json' \
  -d '{"input":{"question":"Should we expand to the EU market?"}}'
```

Fetch the decision and check health:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/decisions/<decisionId>
```

Endpoints: `POST /decisions`, `GET /decisions/:id`, `GET /health`.

### Durable microservice storage (`DEBAITABLE_DATA_DIR`)

By default the microservice above uses `MemoryStore` and `MemoryQueue`, so all
decisions and queued jobs are lost on restart. Set `DEBAITABLE_DATA_DIR` to
run durably with filesystem-backed `FsStore` (`FsDecisionStore`) and `FsQueue`
(`FsDecisionQueue`):

```bash
export DEBAITABLE_DATA_DIR="./data"
npm run serve
```

```bash
DEBAITABLE_DATA_DIR=/var/lib/debaitable npm run serve -- --port 4001
```

When set, `DecisionRecord` objects, decisions, rounds, and job payloads/states
(`queued`, `active`, `completed`, `failed`) are saved as JSON files under that
directory, so state survives server restarts. On startup `FsQueue` detects jobs
left in `active` from a crashed run and requeues them, so no job stays stuck.
See [Configuration](docs/configuration.md) for details.

## Evaluation

Run the reproducible single-model versus consensus evaluation (no API keys
required):

```bash
npm run eval-compare
```

The runner (`src/evaluation/consensus-comparison.ts`) iterates over five fixed
decision scenarios and compares single-role answers with equal-vote and
confidence-weighted consensus. It validates every record with
`DecisionRecordSchema`, preserves model identities, votes, confidence, minority
reports, and partial failures, and writes both Markdown and JSON artifacts.
Use `npm run eval-compare -- --strategy equal` to run one strategy.

See [Evaluation](docs/evaluation.md) and [Limitations](docs/limitations.md) for
the method, narrow win/tie/loss definition, and claims the heuristic suite does
not make.

## Install Methods For Users

Releases are published automatically to [NPM](https://www.npmjs.com/package/debaitable)
and [GitHub Releases](https://github.com/masonliiu/debaitable/releases) whenever a
semantic version tag (e.g. `v1.2.3`) is pushed. The release workflow runs a full
build, typecheck, and test suite before publishing, so every tagged release is
verified stable.

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
- After each automated NPM release, update the Homebrew formula's `url` and `sha256` to point
  to the new versioned tarball. See [docs/homebrew-core-submission.md](docs/homebrew-core-submission.md)
  for the full submission checklist.

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
