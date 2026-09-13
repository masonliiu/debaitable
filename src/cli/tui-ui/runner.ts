import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createProvider, LlmProvider } from '../../ai'
import { createDecision, getDecision } from '../../api'
import { DecisionInput, RoleDefinition } from '../../core'
import { MemoryDecisionQueue, runDecisionJob } from '../../jobs'
import { RoleProviderMap } from '../../orchestration'
import { buildStoredComparisonArtifact, ComparisonArtifact } from '../../orchestration'
import { MemoryDecisionStore } from '../../persistence'

export type TuiSessionContext = {
  store: MemoryDecisionStore
  queue: MemoryDecisionQueue
  provider: LlmProvider
  roles: RoleDefinition[]
  runCounter: number
}

export type DecisionArtifact = {
  generatedAt: string
  decisionId: string
  input: DecisionInput
  status: string
  rounds: { roundIndex: number; roleKey: string; model: string; output: unknown }[]
  record: unknown
  comparison: ComparisonArtifact | null
  runs: unknown[]
}

export const createRoleProviderMap = (
  roles: RoleDefinition[],
  env: NodeJS.ProcessEnv = process.env
): RoleProviderMap => Object.fromEntries(
  roles.flatMap((role) => {
    const key = `DEBAITABLE_PROVIDER_${role.key.toUpperCase()}`
    const kind = env[key]?.trim()
    return kind ? [[role.key, createProvider(kind)]] : []
  })
) as RoleProviderMap

const parseRoundOutput = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export const saveArtifact = async (
  input: DecisionInput,
  decisionId: string,
  result: Awaited<ReturnType<typeof getDecision>>
): Promise<string> => {
  const artifact: DecisionArtifact = {
    generatedAt: new Date().toISOString(),
    decisionId,
    input,
    status: result.decision.status,
    rounds: result.rounds.map((round) => ({
      roundIndex: round.roundIndex,
      roleKey: round.roleKey,
      model: round.model,
      output: parseRoundOutput(round.output),
    })),
    record: result.record,
    comparison: result.record ? buildStoredComparisonArtifact(result.rounds, result.record) : null,
    runs: result.runs,
  }

  const dir = path.resolve(process.cwd(), 'artifacts')
  await mkdir(dir, { recursive: true })
  const stamp = artifact.generatedAt.replace(/[:.]/g, '-')
  const filePath = path.join(dir, `${decisionId}-${stamp}.json`)
  await writeFile(filePath, JSON.stringify(artifact, null, 2), 'utf8')
  return filePath
}

export const runDecisionPipeline = async (
  input: DecisionInput,
  session: TuiSessionContext,
  onProgress: (message: string) => void
): Promise<{ decisionId: string; result: Awaited<ReturnType<typeof getDecision>>; artifactPath: string }> => {
  const apiContext = {
    store: session.store,
    queue: session.queue,
    generateRunId: () => {
      session.runCounter += 1
      return `run_${session.runCounter}`
    },
  }

  onProgress('Creating decision...')
  const created = await createDecision({ input }, apiContext)
  const pending = session.queue.getPending()
  session.queue.clear()

  onProgress(`Queued ${pending.length} job(s).`)
  const providerMap = createRoleProviderMap(session.roles)
  for (const payload of pending) {
    onProgress(`Running ${payload.runId}...`)
    await runDecisionJob(payload, {
      provider: session.provider,
      providerMap,
      store: session.store,
      roles: session.roles,
    })
    onProgress(`${payload.runId} completed.`)
  }

  const result = await getDecision(created.decisionId, apiContext)
  const artifactPath = await saveArtifact(input, created.decisionId, result)
  onProgress(`Artifact saved: ${artifactPath}`)

  return {
    decisionId: created.decisionId,
    result,
    artifactPath,
  }
}
