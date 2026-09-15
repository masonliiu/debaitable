import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  DebateRound,
  Decision,
  DecisionRecord,
  DecisionRun,
  DEFAULT_STATUS,
  DEFAULT_VISIBILITY,
  NotFoundError,
} from "../core";
import { DecisionCreateInput, DecisionStore, DecisionUpdate } from "./types";

type StoredState = {
  decisions: Record<string, Decision>;
  records: Record<string, DecisionRecord>;
  rounds: Record<string, DebateRound[]>;
  runs: Record<string, DecisionRun>;
  runsByDecision: Record<string, string[]>;
  counter: number;
};

const EMPTY_STATE: StoredState = {
  decisions: {},
  records: {},
  rounds: {},
  runs: {},
  runsByDecision: {},
  counter: 0,
};

const cloneDecision = (decision: Decision): Decision => ({
  ...decision,
  goals: [...decision.goals],
  constraints: [...decision.constraints],
});

const cloneRecord = (record: DecisionRecord): DecisionRecord => ({ ...record });

const cloneRounds = (rounds: DebateRound[]): DebateRound[] =>
  rounds.map((round) => ({ ...round }));

const cloneRun = (run: DecisionRun): DecisionRun => {
  if (!run.metadata) {
    return { ...run };
  }
  return {
    ...run,
    metadata: {
      ...run.metadata,
      failures: run.metadata.failures?.map((failure) => ({ ...failure })),
    },
  };
};

const cloneState = (state: StoredState): StoredState => ({
  decisions: Object.fromEntries(
    Object.entries(state.decisions).map(([id, decision]) => [id, cloneDecision(decision)]),
  ),
  records: Object.fromEntries(
    Object.entries(state.records).map(([id, record]) => [id, cloneRecord(record)]),
  ),
  rounds: Object.fromEntries(
    Object.entries(state.rounds).map(([id, rounds]) => [id, cloneRounds(rounds)]),
  ),
  runs: Object.fromEntries(
    Object.entries(state.runs).map(([id, run]) => [id, cloneRun(run)]),
  ),
  runsByDecision: Object.fromEntries(
    Object.entries(state.runsByDecision).map(([id, runIds]) => [id, [...runIds]]),
  ),
  counter: state.counter,
});

const normalizeState = (raw: unknown): StoredState => {
  const base = cloneState(EMPTY_STATE);
  if (typeof raw !== "object" || raw === null) {
    return base;
  }
  const candidate = raw as Partial<StoredState>;
  if (candidate.decisions && typeof candidate.decisions === "object") {
    base.decisions = candidate.decisions as Record<string, Decision>;
  }
  if (candidate.records && typeof candidate.records === "object") {
    base.records = candidate.records as Record<string, DecisionRecord>;
  }
  if (candidate.rounds && typeof candidate.rounds === "object") {
    base.rounds = candidate.rounds as Record<string, DebateRound[]>;
  }
  if (candidate.runs && typeof candidate.runs === "object") {
    base.runs = candidate.runs as Record<string, DecisionRun>;
  }
  if (candidate.runsByDecision && typeof candidate.runsByDecision === "object") {
    base.runsByDecision = candidate.runsByDecision as Record<string, string[]>;
  }
  if (typeof candidate.counter === "number" && Number.isFinite(candidate.counter)) {
    base.counter = Math.floor(candidate.counter);
  }
  return base;
};

export type FsStoreOptions = {
  dataDir: string;
  fileName?: string;
};

export const resolveFsStoreFile = (dataDir: string, fileName = "store.json"): string =>
  path.join(dataDir, fileName);

export class FsDecisionStore implements DecisionStore {
  private readonly filePath: string;
  private readonly dataDir: string;
  private initialized = false;
  private state: StoredState = cloneState(EMPTY_STATE);
  private writeChain: Promise<void> = Promise.resolve();

  constructor(dataDir: string);
  constructor(options: FsStoreOptions);
  constructor(dataDirOrOptions: string | FsStoreOptions) {
    if (typeof dataDirOrOptions === "string") {
      this.dataDir = dataDirOrOptions;
      this.filePath = resolveFsStoreFile(dataDirOrOptions);
    } else {
      this.dataDir = dataDirOrOptions.dataDir;
      this.filePath = resolveFsStoreFile(
        dataDirOrOptions.dataDir,
        dataDirOrOptions.fileName ?? "store.json",
      );
    }
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      if (raw.trim().length === 0) {
        this.state = cloneState(EMPTY_STATE);
      } else {
        this.state = normalizeState(JSON.parse(raw));
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        throw error;
      }
      this.state = cloneState(EMPTY_STATE);
    }
    this.initialized = true;
  }

  async createDecision(input: DecisionCreateInput): Promise<Decision> {
    return this.mutate((state) => {
      state.counter += 1;
      const id = `decision_${state.counter}`;
      const decision: Decision = {
        id,
        title: input.title,
        context: input.context,
        goals: [...input.goals],
        constraints: [...input.constraints],
        decisionType: input.decisionType,
        status: DEFAULT_STATUS,
        visibility: input.visibility ?? DEFAULT_VISIBILITY,
      };
      state.decisions[id] = decision;
      return cloneDecision(decision);
    });
  }

  async updateDecision(id: string, update: DecisionUpdate): Promise<Decision> {
    return this.mutate((state) => {
      const current = state.decisions[id];
      if (!current) {
        throw new NotFoundError(`Decision not found: ${id}`);
      }
      const next: Decision = {
        ...current,
        status: update.status ?? current.status,
        visibility: update.visibility ?? current.visibility,
      };
      state.decisions[id] = next;
      return cloneDecision(next);
    });
  }

  async saveDecisionRecord(id: string, record: DecisionRecord): Promise<void> {
    await this.mutate((state) => {
      if (!state.decisions[id]) {
        throw new NotFoundError(`Decision not found: ${id}`);
      }
      state.records[id] = cloneRecord(record);
    });
  }

  async saveDebateRounds(id: string, rounds: DebateRound[]): Promise<void> {
    await this.mutate((state) => {
      if (!state.decisions[id]) {
        throw new NotFoundError(`Decision not found: ${id}`);
      }
      state.rounds[id] = cloneRounds(rounds);
    });
  }

  async getDecision(id: string): Promise<Decision | null> {
    const state = await this.load();
    const decision = state.decisions[id];
    return decision ? cloneDecision(decision) : null;
  }

  async getDecisionRecord(id: string): Promise<DecisionRecord | null> {
    const state = await this.load();
    const record = state.records[id];
    return record ? cloneRecord(record) : null;
  }

  async getDebateRounds(id: string): Promise<DebateRound[]> {
    const state = await this.load();
    return cloneRounds(state.rounds[id] ?? []);
  }

  async saveDecisionRun(run: DecisionRun): Promise<void> {
    await this.mutate((state) => {
      if (!state.decisions[run.decisionId]) {
        throw new NotFoundError(`Decision not found: ${run.decisionId}`);
      }
      state.runs[run.runId] = cloneRun(run);
      const existing = state.runsByDecision[run.decisionId] ?? [];
      if (!existing.includes(run.runId)) {
        state.runsByDecision[run.decisionId] = [...existing, run.runId];
      }
    });
  }

  async getDecisionRun(runId: string): Promise<DecisionRun | null> {
    const state = await this.load();
    const run = state.runs[runId];
    return run ? cloneRun(run) : null;
  }

  async listDecisionRuns(decisionId: string): Promise<DecisionRun[]> {
    const state = await this.load();
    const runIds = state.runsByDecision[decisionId] ?? [];
    return runIds
      .map((runId) => state.runs[runId])
      .filter((run): run is DecisionRun => Boolean(run))
      .map(cloneRun);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private async load(): Promise<StoredState> {
    await this.ensureInitialized();
    return cloneState(this.state);
  }

  private mutate<T>(fn: (state: StoredState) => T): Promise<T> {
    const run = (async (): Promise<T> => {
      await this.ensureInitialized();
      const result = fn(this.state);
      await this.persist();
      return result;
    })();
    const chained = this.writeChain.then(() => run).then(
      () => undefined,
      () => undefined,
    );
    this.writeChain = chained.then(() => undefined);
    return run;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const payload = JSON.stringify(this.state, null, 2);
    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmpPath, payload, "utf8");
    await fs.rename(tmpPath, this.filePath);
  }
}

export const FsStore = FsDecisionStore;
