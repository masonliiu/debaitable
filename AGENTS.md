# Quoraim Agent Guide

This file is the contract for automated coding agents working in this repo.
Follow it exactly and keep changes small and auditable.

## Quick Project Snapshot
- Goal: multi-agent decision engine with structured debate rounds.
- Output: Decision Record artifact, not just chat.
- Store: audit trail for every round and final record.
- Architecture: UI -> API -> Orchestration -> Persistence.
- Principle: artifact-first, deterministic JSON outputs.

## Non-Negotiables
- Make small, focused commits (no mixed scope).
- Preserve existing code unless explicitly asked to remove it.
- Use TypeScript and Zod for all structured inputs/outputs.
- Keep outputs deterministic and structured where possible.
- Default visibility is private unless user opts in.
- Never log secrets or real user data in examples.
- Avoid long-running API routes; use background jobs.

## Repository Status (as of now)
- No package manager files detected (`package.json`, `pnpm-lock.yaml`, `yarn.lock`).
- No lint/test/build config detected (ESLint/Prettier/Jest/Vitest/Playwright).
- Core domain types and role catalog exist under `src/core`.
- Zod schemas live in `src/core/schemas.ts`.

## Build / Lint / Test Commands
Current commands:
- Dev: `npm run dev`
- Typecheck: `npm run typecheck`

No build, lint, or test commands are defined yet.
If you add tooling, update this section immediately.

Suggested conventions once tooling exists:
- Build: `npm run build`
- Lint: `npm run lint`
- Test (all): `npm run test`
- Test (single): use your runner's single-test flag:
  - Vitest: `npx vitest run path/to/test --testNamePattern "name"`
  - Jest: `npx jest path/to/test -t "name"`
  - Playwright: `npx playwright test path/to/test --grep "name"`

If different commands are added, replace these examples with the actual ones.

## Decision Pipeline (MVP)
- Round 1: independent proposals per role.
- Round 2: critiques and rebuttals.
- Round 3: convergence and vote.
- Aggregation: Decision Record + minority report.

## Roles (MVP)
- Strategist: long-term value and strategic alignment.
- Skeptic: challenge assumptions and surface weaknesses.
- Risk Analyst: failure modes, edge cases, mitigation.
- Execution Planner: steps, dependencies, timeline.
- Cost / ROI: budget constraints and return on investment.

## Data Guarantees
- Every agent output must validate against a Zod schema.
- Store all rounds and the final record for auditability.
- Sanitize user input before injecting into prompts.
- Store minimal PII; avoid raw prompt content when possible.
- Output validation must reject non-conforming results.

## Code Style Guidelines

### General
- Use TypeScript for all new code.
- Prefer pure functions and explicit inputs/outputs.
- Favor small, composable modules.
- Avoid hidden side effects; make state transitions explicit.
- Keep I/O at boundaries (API, jobs, persistence).

### Imports
- Use absolute or relative imports consistently within a file.
- Group imports by origin: external libs, internal modules, then types.
- Keep import lists short; split into multiple lines if needed.
- Avoid unused imports.

### Formatting
- Keep line lengths reasonable (aim ~100 chars).
- Use trailing commas in multi-line objects/arrays.
- Prefer single quotes only if the codebase already uses them.
- Align object keys only when it improves readability.

### Types and Schemas
- Define Zod schemas for any new structured input/output.
- Export both types and schemas when possible.
- Keep schema validation close to the boundary where data enters.
- When converting raw model output to typed data, validate immediately.
- Prefer exact unions/enums over free-form strings.

### Naming Conventions
- Files: `kebab-case.ts` or match existing style.
- Types/interfaces: `PascalCase`.
- Variables/functions: `camelCase`.
- Constants: `SCREAMING_SNAKE_CASE` only for true constants.
- Zod schemas: `ThingSchema` naming.

### Error Handling
- Fail fast at boundaries with clear, structured errors.
- Return typed error objects where possible.
- Do not swallow errors; bubble them to the orchestrator.
- When retrying, use deterministic retry logic.
- Never log secrets or user-provided sensitive content.

### Determinism and Auditing
- Ensure outputs are reproducible given the same inputs.
- Keep prompts stable and versioned if changed.
- Store raw model responses only when needed for auditability.
- Prefer structured JSON outputs over free-form text.

## Layered Architecture Expectations
- UI: collects decision input, shows status + timeline.
- API: validates input, writes decision, enqueues job.
- Orchestration: runs debate rounds, validates outputs.
- Persistence: stores rounds, decisions, and Decision Record.

## Security and Privacy
- Secrets only in env vars; never commit keys/tokens.
- Default visibility is private.
- Rate limit decision creation endpoints.
- Sanitize any user input used in prompts.
- Avoid storing raw prompt content when possible.

## Environment Variables
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: gpt-5)

## Commit Policy (when committing is requested)
- Commit after each discrete task (docs, schema, API, UI, jobs).
- Prefer single-file commits unless tightly coupled.
- Keep diffs small and reviewable.
- Use descriptive commit messages focused on intent.

## Cursor / Copilot Rules
- No `.cursor/rules/` directory detected.
- No `.cursorrules` file detected.
- No `.github/copilot-instructions.md` detected.
- If any of these files are added later, copy their rules here.

## Updating This File
- Update this guide when build/test tooling is added.
- Keep it accurate; remove placeholders once real commands exist.
