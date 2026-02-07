import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { createOpenAiProvider, HeuristicDebateProvider, LlmProvider } from '../ai'
import { createDecision, getDecision } from '../api'
import { DecisionInput, DecisionType, RoleDefinition, roleDefinitions } from '../core'
import { MemoryDecisionQueue, runDecisionJob } from '../jobs'
import { MemoryDecisionStore } from '../persistence'

const decisionTypes: DecisionType[] = ['product', 'engineering', 'hiring', 'growth']

type SessionContext = {
  store: MemoryDecisionStore
  queue: MemoryDecisionQueue
  provider: LlmProvider
  roles: RoleDefinition[]
  runCounter: number
}

type DecisionArtifact = {
  generatedAt: string
  decisionId: string
  input: DecisionInput
  status: string
  rounds: { roundIndex: number; roleKey: string; output: unknown }[]
  record: unknown
  runs: unknown[]
}

const printHeader = () => {
  console.log('')
  console.log('Quoraim Decision CLI')
  console.log('Structured multi-role debate -> auditable decision record')
  console.log('')
}

const parseList = (raw: string): string[] =>
  raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

const askNonEmpty = async (
  rl: ReturnType<typeof createInterface>,
  label: string
): Promise<string> => {
  while (true) {
    const answer = (await rl.question(`${label}: `)).trim()
    if (answer.length > 0) {
      return answer
    }
    console.log('Please enter a value.')
  }
}

const askList = async (
  rl: ReturnType<typeof createInterface>,
  label: string
): Promise<string[]> => {
  while (true) {
    const answer = (await rl.question(`${label} (comma separated): `)).trim()
    const values = parseList(answer)
    if (values.length > 0) {
      return values
    }
    console.log('Please enter at least one item.')
  }
}

const askDecisionType = async (
  rl: ReturnType<typeof createInterface>
): Promise<DecisionType> => {
  while (true) {
    console.log('Decision type:')
    for (let index = 0; index < decisionTypes.length; index += 1) {
      console.log(`  ${index + 1}. ${decisionTypes[index]}`)
    }
    const answer = (await rl.question('Choose 1-4: ')).trim()
    const parsed = Number(answer)
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= decisionTypes.length) {
      return decisionTypes[parsed - 1]
    }
    console.log('Invalid choice.')
  }
}

const askProviderMode = async (
  rl: ReturnType<typeof createInterface>
): Promise<'openai' | 'heuristic'> => {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY)
  if (!hasApiKey) {
    console.log('OPENAI_API_KEY not found, using deterministic heuristic provider.')
    return 'heuristic'
  }
  while (true) {
    const answer = (await rl.question('Use OpenAI model? [Y/n]: ')).trim().toLowerCase()
    if (answer === '' || answer === 'y' || answer === 'yes') {
      return 'openai'
    }
    if (answer === 'n' || answer === 'no') {
      return 'heuristic'
    }
    console.log('Enter y or n.')
  }
}

const buildInput = async (
  rl: ReturnType<typeof createInterface>
): Promise<DecisionInput> => {
  const title = await askNonEmpty(rl, 'Title')
  const context = await askNonEmpty(rl, 'Context')
  const goals = await askList(rl, 'Goals')
  const constraints = await askList(rl, 'Constraints')
  const decisionType = await askDecisionType(rl)
  return {
    title,
    context,
    goals,
    constraints,
    decisionType,
  }
}

const parseRoundOutput = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

const saveArtifact = async (
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
      output: parseRoundOutput(round.output),
    })),
    record: result.record,
    runs: result.runs,
  }
  const dir = path.resolve(process.cwd(), 'artifacts')
  await mkdir(dir, { recursive: true })
  const stamp = artifact.generatedAt.replace(/[:.]/g, '-')
  const filePath = path.join(dir, `${decisionId}-${stamp}.json`)
  await writeFile(filePath, JSON.stringify(artifact, null, 2), 'utf8')
  return filePath
}

const printSection = (title: string) => {
  console.log('')
  console.log(title)
  console.log('-'.repeat(title.length))
}

const printList = (values: string[]) => {
  for (const value of values) {
    console.log(`- ${value}`)
  }
}

const printDecisionResult = (result: Awaited<ReturnType<typeof getDecision>>) => {
  printSection('Decision Status')
  console.log(`ID: ${result.decision.id}`)
  console.log(`Status: ${result.decision.status}`)

  if (result.record) {
    printSection('Decision Record')
    console.log(`Summary: ${result.record.summary}`)
    console.log(`Rationale: ${result.record.rationale}`)
    console.log(`Confidence: ${result.record.confidence}`)
    console.log('Tradeoffs:')
    printList(result.record.tradeoffs)
    console.log('Risks:')
    printList(result.record.risks)
    console.log('Actions:')
    printList(result.record.actions)
    console.log(`Minority report: ${result.record.minorityReport}`)
  }

  printSection('Audit Timeline')
  for (const round of result.rounds) {
    console.log(`Round ${round.roundIndex} | ${round.roleKey}`)
    const parsed = parseRoundOutput(round.output)
    console.log(JSON.stringify(parsed, null, 2))
  }
}

const runSingleDecision = async (
  input: DecisionInput,
  session: SessionContext
): Promise<{ decisionId: string; result: Awaited<ReturnType<typeof getDecision>> }> => {
  const apiContext = {
    store: session.store,
    queue: session.queue,
    generateRunId: () => {
      session.runCounter += 1
      return `run_${session.runCounter}`
    },
  }

  const created = await createDecision({ input }, apiContext)
  const pending = session.queue.getPending()
  session.queue.clear()

  console.log('')
  console.log(`Queued decision ${created.decisionId}. Running ${pending.length} job(s)...`)

  for (const payload of pending) {
    console.log(`- ${payload.runId}: running debate rounds`) 
    await runDecisionJob(payload, {
      provider: session.provider,
      store: session.store,
      roles: session.roles,
    })
    console.log(`- ${payload.runId}: completed`)
  }

  const result = await getDecision(created.decisionId, apiContext)
  return { decisionId: created.decisionId, result }
}

export const runTui = async (): Promise<void> => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    printHeader()
    const mode = await askProviderMode(rl)
    const provider = mode === 'openai' ? createOpenAiProvider() : new HeuristicDebateProvider()

    const session: SessionContext = {
      store: new MemoryDecisionStore(),
      queue: new MemoryDecisionQueue(),
      provider,
      roles: roleDefinitions,
      runCounter: 0,
    }

    while (true) {
      printSection('New Decision')
      const input = await buildInput(rl)
      const { decisionId, result } = await runSingleDecision(input, session)
      printDecisionResult(result)
      const artifactPath = await saveArtifact(input, decisionId, result)
      console.log('')
      console.log(`Artifact saved to ${artifactPath}`)

      const again = (await rl.question('Run another decision? [y/N]: ')).trim().toLowerCase()
      if (again !== 'y' && again !== 'yes') {
        break
      }
    }
  } finally {
    rl.close()
  }
}
