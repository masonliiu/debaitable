# DebAItable Consensus Comparison

This report is produced by the offline `eval-compare` harness. It compares a
single-role answer with equal-vote and confidence-weighted multi-role debate;
it does not claim that consensus is more accurate than an individual model.

## Reproduce it

```bash
npm run eval-compare
```

The command evaluates five fixed decision prompts without API keys, writes this
document to `docs/evaluation.md`, and writes the machine-readable artifact to
`artifacts/evaluation-report.json`. Use `--strategy equal` or
`--strategy confidence-weighted` to run only one strategy, or `--out` and
`--json-out` to choose other output paths.

## Method

For each prompt, DebAItable runs every role once as an ablated single-role
baseline and then runs the complete debate twice. Every final record is checked
with `DecisionRecordSchema`. The report records role/model identity, vote,
confidence, agreements, disagreements, minority report, and any partial
provider failure instead of silently dropping it.

The aggregate `win`/`tie`/`loss` labels have a narrow definition:

- **win** — consensus label matches the unique modal single-role label.
- **tie** — there is no unique individual mode, or the consensus run failed.
- **loss** — consensus label differs from a unique individual mode.

These labels measure agreement with this small baseline, not decision quality.

## Prompts

1. Launch a mobile app MVP within 60 days.
2. Migrate a monolith to microservices this quarter.
3. Hire an offshore engineering team.
4. Build or buy an observability API.
5. Rotate production credentials after a suspected leak.

The generated tables contain the per-prompt results and should be committed or
attached to a release only when their provider, scenario set, and limitations
are clearly identified.

## Interpretation

Read each minority report and role-level disagreement before acting. A high
agreement count can mean that the heuristic provider repeats the same framing;
it is not evidence that the recommendation is safe, profitable, or correct.
See [limitations](limitations.md) for failure modes and claims this harness
explicitly avoids.
