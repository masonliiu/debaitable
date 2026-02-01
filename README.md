# Quoraim

Quoraim is a multi-agent decision engine for product and team choices. It runs structured debate rounds across specialized roles, then outputs a Decision Record with rationale, tradeoffs, risks, and an actionable plan.

## Why Quoraim
Most decision tools are unstructured chat. Quoraim is artifact-first: it produces a clear, auditable record that teams can review, compare, and iterate on.

## Core Features (MVP)
- Multi-round debate pipeline (proposal -> critique -> convergence)
- Specialized roles (Strategist, Skeptic, Risk Analyst, Execution Planner)
- Decision Record artifact with minority report
- Audit trail of every round
- Asynchronous runs with progress tracking

## Stack
- Next.js (App Router)
- TypeScript
- TanStack Query
- Tailwind CSS
- Zod
- Prisma + PostgreSQL (Neon)
- Trigger.dev (background jobs)
- OpenAI (gpt-5)

## Architecture (High Level)
1. UI submits decision input.
2. API creates a Decision and enqueues a background job.
3. Trigger.dev runs debate rounds and aggregates outputs.
4. Decision Record and debate rounds are stored in Postgres.
5. UI polls job status and renders results.

## Getting Started
1. Install dependencies
   - `npm install`
2. Configure environment variables (see below)
3. Run the dev server
   - `npm run dev`

## Environment Variables
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: gpt-5)
- `TRIGGER_API_KEY`
- `TRIGGER_API_URL`

## Roadmap
- Role presets and decision modes
- Auth + user-scoped histories
- Decision sharing (unlisted/public)
- Model comparison and stability checks
- Decision diffing

## License
All rights reserved. No license is granted to use, copy, modify, or distribute this software.
