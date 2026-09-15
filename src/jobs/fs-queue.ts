import { promises as fs } from "node:fs";
import * as path from "node:path";
import { DecisionQueue } from "./queue";
import { DecisionJobPayload } from "./types";

export type JobState = "queued" | "active" | "completed" | "failed";

export type JobEntry = {
  payload: DecisionJobPayload;
  state: JobState;
  enqueuedAt: string;
  updatedAt: string;
};

type StoredJobs = {
  jobs: Record<string, JobEntry>;
};

const EMPTY_STORE: StoredJobs = { jobs: {} };

const cloneEntry = (entry: JobEntry): JobEntry => ({ ...entry, payload: { ...entry.payload } });

const normalizeStore = (raw: unknown): StoredJobs => {
  if (typeof raw !== "object" || raw === null) {
    return { jobs: {} };
  }
  const candidate = raw as Partial<StoredJobs>;
  if (candidate.jobs && typeof candidate.jobs === "object") {
    return { jobs: candidate.jobs as Record<string, JobEntry> };
  }
  return { jobs: {} };
};

export type FsQueueOptions = {
  dataDir: string;
  fileName?: string;
  crashRecovery?: "fail" | "requeue";
};

export const resolveFsQueueFile = (dataDir: string, fileName = "queue.json"): string =>
  path.join(dataDir, fileName);

export class FsDecisionQueue implements DecisionQueue {
  private readonly filePath: string;
  private readonly dataDir: string;
  private readonly crashRecovery: "fail" | "requeue";
  private initialized = false;
  private store: StoredJobs = { jobs: {} };
  private writeChain: Promise<void> = Promise.resolve();

  constructor(dataDir: string);
  constructor(options: FsQueueOptions);
  constructor(dataDirOrOptions: string | FsQueueOptions) {
    if (typeof dataDirOrOptions === "string") {
      this.dataDir = dataDirOrOptions;
      this.filePath = resolveFsQueueFile(dataDirOrOptions);
      this.crashRecovery = "requeue";
    } else {
      this.dataDir = dataDirOrOptions.dataDir;
      this.filePath = resolveFsQueueFile(
        dataDirOrOptions.dataDir,
        dataDirOrOptions.fileName ?? "queue.json",
      );
      this.crashRecovery = dataDirOrOptions.crashRecovery ?? "requeue";
    }
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      if (raw.trim().length === 0) {
        this.store = { jobs: {} };
      } else {
        this.store = normalizeStore(JSON.parse(raw));
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        throw error;
      }
      this.store = { jobs: {} };
    }
    this.recoverActiveJobs();
    this.initialized = true;
    await this.persist();
  }

  async enqueueDecision(payload: DecisionJobPayload): Promise<void> {
    await this.mutate((store) => {
      const jobId = `${payload.decisionId}:${payload.runId}`;
      const now = new Date().toISOString();
      store.jobs[jobId] = {
        payload: { ...payload },
        state: "queued",
        enqueuedAt: now,
        updatedAt: now,
      };
    });
  }

  async markActive(payload: DecisionJobPayload): Promise<void> {
    await this.mutate((store) => {
      const jobId = `${payload.decisionId}:${payload.runId}`;
      const entry = store.jobs[jobId];
      if (entry) {
        entry.state = "active";
        entry.updatedAt = new Date().toISOString();
      }
    });
  }

  async markCompleted(payload: DecisionJobPayload): Promise<void> {
    await this.mutate((store) => {
      const jobId = `${payload.decisionId}:${payload.runId}`;
      const entry = store.jobs[jobId];
      if (entry) {
        entry.state = "completed";
        entry.updatedAt = new Date().toISOString();
      }
    });
  }

  async markFailed(payload: DecisionJobPayload): Promise<void> {
    await this.mutate((store) => {
      const jobId = `${payload.decisionId}:${payload.runId}`;
      const entry = store.jobs[jobId];
      if (entry) {
        entry.state = "failed";
        entry.updatedAt = new Date().toISOString();
      }
    });
  }

  getPending(): DecisionJobPayload[] {
    return Object.values(this.store.jobs)
      .filter((entry) => entry.state === "queued")
      .map((entry) => ({ ...entry.payload }));
  }

  getAll(): JobEntry[] {
    return Object.values(this.store.jobs).map(cloneEntry);
  }

  clear(): void {
    this.store = { jobs: {} };
  }

  private recoverActiveJobs(): void {
    const now = new Date().toISOString();
    for (const entry of Object.values(this.store.jobs)) {
      if (entry.state === "active") {
        if (this.crashRecovery === "requeue") {
          entry.state = "queued";
        } else {
          entry.state = "failed";
        }
        entry.updatedAt = now;
      }
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private mutate(fn: (store: StoredJobs) => void): Promise<void> {
    const run = (async (): Promise<void> => {
      await this.ensureInitialized();
      fn(this.store);
      await this.persist();
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
    const payload = JSON.stringify(this.store, null, 2);
    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmpPath, payload, "utf8");
    await fs.rename(tmpPath, this.filePath);
  }
}

export const FsQueue = FsDecisionQueue;
