# DebAItable Evaluation — Limitations

This document publishes known real-world performance limitations of the
multi-model consensus approach compared to individual model answers.
Findings are intentionally conservative and reproducible. They are based on
the deterministic heuristic provider, not on live cloud-model benchmarks.

## How to reproduce

Run the reproducible evaluation suite (no API keys required):

```bash
npm run evaluate
```

The runner (`src/cli/evaluate.ts`) iterates over three real-world decision
scenarios:

- `scenario-product` — Launch mobile app MVP within 60 days
- `scenario-engineering` — Migrate monolith to microservices
- `scenario-hiring` — Hire offshore engineering team

For each scenario it captures:

1. Individual answers: one run per role (`strategist`, `skeptic`,
   `risk_analyst`, `execution_planner`, `cost_roi`) using
   `HeuristicDebateProvider`.
2. Consensus answer: one full multi-role run via `runDecisionJob` with all
   `roleDefinitions`, persisted as a `DecisionRecord`.
3. Comparison: normalized `decision` agreement / disagreement counts plus a
   Markdown report printed to stdout.

All records are validated with `DecisionRecordSchema`. See
`tests/evaluation.test.ts` for schema-validity, minority-report, and
fallback-recovery checks.

## Observed limitations of consensus vs. individual models

1. **Consensus dilutes sharp dissent.**
   Individual `skeptic` and `risk_analyst` runs vote `conditional` under the
   heuristic provider, while `strategist`, `execution_planner`, and
   `cost_roi` vote `support`. The consensus record preserves this only as a
   `minorityReport` string. Readers who skip the minority report see a
   more confident outcome than two of five roles held.

2. **No ground-truth accuracy claim.**
   The heuristic suite checks schema conformance, minority-report
   preservation, and deterministic recovery via `FallbackProvider`. It does
   not measure decision quality, business outcomes, or win-rate against
domain
experts. Do not interpret agreement counts as correctness.

3. **Single-provider bias.**
   Reproducible runs use only `HeuristicDebateProvider`. Real deployments
   mix `openai`, `anthropic`, `gemini`, `ollama`, and `generic` adapters via
   `DEBAITABLE_PROVIDER_<ROLE>`. Cross-provider disagreement, latency, cost,
   and failure modes are not represented in the default `npm run evaluate`
   output.

4. **Small, fixed scenario set.**
   Three hand-written inputs cannot cover product, engineering, hiring,
   legal, security, or financial edge cases. Constraints such as budget
   freezes, zero-downtime requirements, and timezone overlap are simplified.
   Results may not generalize.

5. **Single-role runs are ablated contexts.**
   Individual answers are produced by running the pipeline with a single
   role (`roles: [role]`). They lack critique (Round 2) and convergence vote
   (Round 3) pressure, so they look more decisive than the same role would
   be inside a full debate.

6. **Normalization is lossy.**
   Comparison lowercases and trims the top-level `decision` /
   `executive.decision` string. Paraphrases (for example, "go" vs.
   "proceed with conditions") may count as disagreement, while semantically
   different rationales with the same label count as agreement.

7. **Failure handling favors availability over fidelity.**
   When the primary provider fails, `FallbackProvider` substitutes the next
   provider to guarantee a schema-valid `DecisionRecord`. This improves
   operational recovery but can mask upstream outages in the final artifact
   if callers do not inspect run metadata.

## When to prefer individual review over consensus

- High-risk or irreversible decisions: read the per-role summaries and
  `minorityReport` directly; do not rely on the consensus `summary` alone.
- Tight budget / latency budgets: a single-role run is cheaper and faster
  than a full 3-round debate.
- Provider outage investigations: compare individual adapter outputs before
  trusting a fallback-substituted consensus.

## What we do not claim

- No claim that consensus outperforms the best individual model on accuracy.
- No claim about cloud-model latency, cost, or quality from heuristic runs.
- No storage of raw prompts or PII for evaluation; only validated record
  fields and truncated summaries are compared.

## Future evaluation work

- Add opt-in cloud-model evaluation with recorded provider/model IDs,
  retries, and cost/latency columns.
- Expand the scenario set and add human-rated decision-quality rubrics.
- Emit machine-readable JSON reports (for example,
  `artifacts/evaluation-report.json`) alongside the current Markdown stdout.
