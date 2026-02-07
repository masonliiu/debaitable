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
     - `?` opens compact help
5. Typecheck:
   - `npm run typecheck`

## Install From npm (Global CLI)
1. Publish package from this repo:
   - `npm login`
   - `npm publish --access public`
2. Install globally:
   - `npm i -g debaitable`
3. Run from any terminal:
   - `debaitable`

## Repository Scope (Today)
- Engine modules under `src/`:
  - `core`, `api`, `orchestration`, `jobs`, `persistence`, `ai`, `cli`
- In-memory queue and store are the default runtime adapters.
- No web UI or external DB wiring in this repo yet.

## License
All rights reserved. No license is granted to use, copy, modify, or distribute this software.
