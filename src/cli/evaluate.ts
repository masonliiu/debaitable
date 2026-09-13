#!/usr/bin/env node
/**
 * DebAItable real-world evaluation runner.
 *
 * Iterates over a small set of real-world decision scenarios, captures
 * per-role (individual) answers plus the full multi-role consensus
 * DecisionRecord, and prints a Markdown comparison report.
 *
 * Operational usage (see README):
 *   npm run evaluate
 *   npm run evaluate -- --output artifacts/evaluation-report.md (future flag, stdout today)
 *
 * Uses only the deterministic heuristic provider so the suite is
 * reproducible without API keys. Findings are intentionally conservative;
 * see docs/limitations.md for published limitations.
 */
import { HeuristicDebateProvider } from "../ai/heuristic-provider.js";
import { roleDefinitions } from "../core/roles.js";
import { DecisionRecordSchema } from "../core/schemas.js";
import { runDecisionJob } from "../jobs/run-decision.js";
import { MemoryDecisionStore } from "../persistence/memory-store.js";

type StoreInput = Parameters<MemoryDecisionStore["createDecision"]>[0];
type ConsensusRecord = NonNullable<
  Awaited<ReturnType<MemoryDecisionStore["getDecisionRecord"]>>
>;
type RoleDef = (typeof roleDefinitions)[number];

export interface EvaluationScenario {
  id: string;
  input: StoreInput;
}

export interface IndividualAnswer {
  role: string;
  ok: boolean;
  decision?: string;
  summary?: string;
  error?: string;
}

export interface ScenarioEvaluation {
  scenarioId: string;
  title: string;
  individuals: IndividualAnswer[];
  consensus: ConsensusRecord | null;
  consensusError?: string;
  agreements: number;
  disagreements: number;
}

export const EVALUATION_SCENARIOS: EvaluationScenario[] = [
  {
    id: "scenario-product",
    input: {
      title: "Launch mobile app MVP",
      context: "We need to decide whether to launch a mobile app MVP within 60 days.",
      goals: ["Capture early adopters", "Validate product-market fit"],
      constraints: ["Limited engineering resources", "Q4 budget freeze"],
      decisionType: "product",
    } as StoreInput,
  },
  {
    id: "scenario-engineering",
    input: {
      title: "Migrate to microservices",
      context: "Should we migrate our monolith to microservices?",
      goals: ["Improve scalability", "Enable independent deployments"],
      constraints: ["Zero downtime required", "Team of 5 engineers"],
      decisionType: "engineering",
    } as StoreInput,
  },
  {
    id: "scenario-hiring",
    input: {
      title: "Hire offshore engineering team",
      context: "Is hiring an offshore engineering team the right choice?",
      goals: ["Reduce cost", "Scale capacity rapidly"],
      constraints: ["Timezone overlap minimum 4 hours", "IP protection requirements"],
      decisionType: "hiring",
    } as StoreInput,
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function extractDecision(record: unknown): string | undefined {
  const root = asRecord(record);
  const direct = toText(root["decision"]);
  if (direct !== undefined) return direct;
  for (const key of ["executive", "executiveDecision", "executive_decision"]) {
    const nested = asRecord(root[key]);
    const nestedDecision = toText(nested["decision"]);
    if (nestedDecision !== undefined) return nestedDecision;
  }
  return undefined;
}

export function extractSummary(record: unknown): string | undefined {
  const root = asRecord(record);
  return toText(root["summary"]);
}

export function normalizeDecision(value: string | undefined): string {
  return (value ?? "unknown").trim().toLowerCase();
}

export function compareDecisions(individual: string | undefined, consensus: string | undefined): boolean {
  return normalizeDecision(individual) === normalizeDecision(consensus);
}

async function runSingleRole(
  scenario: EvaluationScenario,
  role: RoleDef,
): Promise<IndividualAnswer> {
  const roleName = String(asRecord(role)["name"] ?? asRecord(role)["id"] ?? "unknown-role");
  const store = new MemoryDecisionStore();
  const provider = new HeuristicDebateProvider();
  try {
    const decision = await store.createDecision(scenario.input);
    await runDecisionJob(
      { decisionId: decision.id, runId: `${scenario.id}-individual-${roleName}` },
      { provider, store, roles: [role] },
    );
    const raw = await store.getDecisionRecord(decision.id);
    const parsed = DecisionRecordSchema.safeParse(raw);
    if (!parsed.success) {
      return { role: roleName, ok: false, error: "individual record failed schema validation" };
    }
    return {
      role: roleName,
      ok: true,
      decision: extractDecision(parsed.data),
      summary: extractSummary(parsed.data)?.slice(0, 500),
    };
  } catch (error) {
    return {
      role: roleName,
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 500) : "unknown error",
    };
  }
}

async function runConsensus(scenario: EvaluationScenario): Promise<{
  record: ConsensusRecord | null;
  error?: string;
}> {
  const store = new MemoryDecisionStore();
  const provider = new HeuristicDebateProvider();
  try {
    const decision = await store.createDecision(scenario.input);
    await runDecisionJob(
      { decisionId: decision.id, runId: `${scenario.id}-consensus` },
      { provider, store, roles: roleDefinitions },
    );
    const raw = await store.getDecisionRecord(decision.id);
    const parsed = DecisionRecordSchema.safeParse(raw);
    if (!parsed.success) {
      return { record: null, error: "consensus record failed schema validation" };
    }
    return { record: parsed.data as ConsensusRecord };
  } catch (error) {
    return {
      record: null,
      error: error instanceof Error ? error.message.slice(0, 500) : "unknown error",
    };
  }
}

export async function evaluateScenario(scenario: EvaluationScenario): Promise<ScenarioEvaluation> {
  const individuals: IndividualAnswer[] = [];
  for (const role of roleDefinitions) {
    individuals.push(await runSingleRole(scenario, role));
  }
  const consensusResult = await runConsensus(scenario);
  const consensusDecision = consensusResult.record
    ? extractDecision(consensusResult.record)
    : undefined;

  let agreements = 0;
  let disagreements = 0;
  for (const individual of individuals) {
    if (!individual.ok || consensusResult.record === null) continue;
    if (compareDecisions(individual.decision, consensusDecision)) {
      agreements += 1;
    } else {
      disagreements += 1;
    }
  }

  const titleText = toText(asRecord(scenario.input)["title"]) ?? scenario.id;
  return {
    scenarioId: scenario.id,
    title: titleText,
    individuals,
    consensus: consensusResult.record,
    consensusError: consensusResult.error,
    agreements,
    disagreements,
  };
}

export async function runEvaluation(
  scenarios: EvaluationScenario[] = EVALUATION_SCENARIOS,
): Promise<ScenarioEvaluation[]> {
  const results: ScenarioEvaluation[] = [];
  for (const scenario of scenarios) {
    results.push(await evaluateScenario(scenario));
  }
  return results;
}

export function toMarkdownReport(results: ScenarioEvaluation[]): string {
  const lines: string[] = [];
  lines.push("# DebAItable Evaluation Report");
  lines.push("");
  lines.push(
    `Scenarios evaluated: ${results.length}. Individual = single-role heuristic run; Consensus = full multi-role run.`,
  );
  lines.push("");
  for (const result of results) {
    lines.push(`## ${result.scenarioId} — ${result.title}`);
    if (result.consensus === null) {
      lines.push("");
      lines.push(`- Consensus: FAILED (${result.consensusError ?? "unknown error"})`);
    } else {
      const consensusDecision = extractDecision(result.consensus) ?? "unknown";
      const consensusSummary = extractSummary(result.consensus) ?? "(no summary)";
      lines.push("");
      lines.push(`- Consensus decision: \`${consensusDecision}\``);
      lines.push(`- Consensus summary: ${consensusSummary.slice(0, 500)}`);
      lines.push(`- Agreement: ${result.agreements} agree / ${result.disagreements} disagree`);
    }
    lines.push("");
    lines.push("| role | ok | decision | summary / error |");
    lines.push("| --- | --- | --- | --- |");
    for (const individual of result.individuals) {
      const detail = individual.ok
        ? (individual.summary ?? "(no summary)").replace(/\|/g, "\\|").slice(0, 160)
        : (individual.error ?? "failed").replace(/\|/g, "\\|").slice(0, 160);
      lines.push(
        `| ${individual.role} | ${individual.ok ? "yes" : "no"} | \`${(individual.decision ?? "n/a").replace(/\|/g, "\\|")}\` | ${detail} |`,
      );
    }
    lines.push("");
  }
  lines.push("## Observed limitations (conservative, heuristic-only)");
  lines.push("");
  lines.push("- Heuristic provider is deterministic; agreement rates overstate real-model diversity.");
  lines.push("- Single-role runs lack cross-examination, so consensus usually reads more hedged.");
  lines.push("- No latency, cost, or live-model quality signal is captured by this offline suite.");
  lines.push("");
  return lines.join("\n");
}

export async function main(): Promise<void> {
  const results = await runEvaluation();
  const report = toMarkdownReport(results);
  console.log(report);
}

function isDirectExecution(): boolean {
  const proc = (globalThis as { process?: { argv?: string[] } }).process;
  const entry = proc?.argv?.[1] ?? "";
  return entry.endsWith("evaluate.ts") || entry.endsWith("evaluate.js");
}

if (isDirectExecution()) {
  void main();
}
