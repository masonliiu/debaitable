# Quoraim Agent Guide

This document is the contract for any agent operating in this repo.

## Project Goals
- Build a multi-agent decision engine with structured debate rounds
- Produce a Decision Record artifact (not just chat)
- Maintain an auditable trail of every round

## Non-Negotiables
- Make small, focused commits. No large or mixed-scope commits.
- Preserve existing code unless explicitly asked to remove it.
- Use TypeScript and Zod for all structured inputs/outputs.
- Keep outputs deterministic and structured wherever possible.

## Decision Pipeline (MVP)
- Round 1: Independent proposals (per role)
- Round 2: Critiques and rebuttals
- Round 3: Convergence and vote
- Aggregation: Decision Record + minority report

## Design Pattern
- Layered architecture: UI -> API -> Orchestration -> Persistence
- Artifact-first outputs: every step produces structured JSON
- Deterministic contracts: Zod schemas define the only valid shapes

## System Architecture (Optimized)
- UI submits decision input and receives a job id
- API validates input, writes Decision, enqueues Trigger.dev task
- Orchestrator runs debate rounds with strict schemas and retries
- Aggregator writes DecisionRecord and final status
- UI polls status and renders debate timeline + Decision Record

## Roles (MVP)
- Strategist: long-term value and strategic alignment
- Skeptic: challenge assumptions and surface weaknesses
- Risk Analyst: failure modes, edge cases, and mitigation
- Execution Planner: steps, dependencies, timeline

## Data Guarantees
- Every agent output must be valid JSON matching its Zod schema.
- Store all rounds and final record for auditability.
- Default visibility is private.

## Commit Policy
- Commit after each discrete task (docs, schema, API, UI, jobs)
- Prefer single-file commits unless the files are tiny or tightly coupled
- If a file grows significantly, commit in small increments as you go
- Keep commits under control: small, reviewable diffs
- Use descriptive commit messages focused on intent

## Safety
- Do not log secrets or include real user data in examples
- Avoid long-running requests in API routes; use Trigger.dev

## Security Measures
- Secrets in env vars only; never commit keys or tokens
- Input validation with Zod on every boundary (UI and API)
- Output validation: reject any agent output that fails schema checks
- Rate limit decision creation endpoints to prevent abuse
- Default visibility is private; public sharing is opt-in
- Sanitize user input before injecting into prompts
- Store minimal PII; avoid storing raw prompt content when possible
- Audit logging for job runs and failures
