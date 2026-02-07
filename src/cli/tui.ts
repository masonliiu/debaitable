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
const defaultGoal = 'Choose the strongest path with clear tradeoffs and execution steps.'
const defaultConstraint = 'Keep scope practical for near-term execution.'

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

const normalizePhrase = (value: string): string =>
  value.replace(/[?!.,;:]+$/g, '').replace(/\s+/g, ' ').trim()

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

const toWords = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((part) => part.length > 0)

const inferDecisionType = (value: string): DecisionType => {
  const words = new Set(toWords(value))
  if (
    words.has('engineer') ||
    words.has('engineering') ||
    words.has('infra') ||
    words.has('architecture') ||
    words.has('technical')
  ) {
    return 'engineering'
  }
  if (
    words.has('hire') ||
    words.has('hiring') ||
    words.has('recruit') ||
    words.has('candidate') ||
    words.has('team')
  ) {
    return 'hiring'
  }
  if (
    words.has('growth') ||
    words.has('acquisition') ||
    words.has('marketing') ||
    words.has('funnel') ||
    words.has('activation')
  ) {
    return 'growth'
  }
  return 'product'
}

const buildTitleFromSituation = (value: string): string => {
  const firstSentence = value.split(/[.!?]/)[0]?.trim() ?? value.trim()
  if (firstSentence.length <= 90) {
    return firstSentence
  }
  return `${firstSentence.slice(0, 87).trim()}...`
}

const extractQuotedList = (source: string, keyword: string): string[] => {
  const regex = new RegExp(`${keyword}\\s*:\\s*([^.;\\n]+)`, 'i')
  const match = source.match(regex)
  if (!match) {
    return []
  }
  return parseList(match[1]).map(normalizePhrase).filter((part) => part.length > 0)
}

const inferConstraints = (value: string): string[] => {
  const explicit = extractQuotedList(value, 'constraints?')
  if (explicit.length > 0) {
    return explicit
  }
  const fragments: string[] = []
  const patterns = [
    /within\s+[^,.;]+/gi,
    /by\s+[^,.;]+/gi,
    /no\s+[^,.;]+/gi,
    /without\s+[^,.;]+/gi,
    /must\s+[^,.;]+/gi,
    /cannot\s+[^,.;]+/gi,
    /can\'t\s+[^,.;]+/gi,
  ]
  for (const pattern of patterns) {
    const matches = value.match(pattern) ?? []
    for (const match of matches) {
      const next = normalizePhrase(match)
      if (next.length > 0) {
        fragments.push(next)
      }
    }
  }
  if (fragments.length > 0) {
    const unique = [...new Set(fragments.map((item) => item.toLowerCase()))]
    const compact = unique.filter(
      (item) => !unique.some((other) => other !== item && item.includes(other))
    )
    return compact
      .map((item) => item[0].toUpperCase() + item.slice(1))
      .slice(0, 3)
  }
  const bits = value
    .split(/[.;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  const keywords = ['within', 'by', 'deadline', 'budget', 'no ', 'cannot', "can't", 'must']
  const inferred = bits.filter((part) =>
    keywords.some((keyword) => part.toLowerCase().includes(keyword))
  )
  return inferred.length > 0
    ? inferred.map(normalizePhrase).filter((part) => part.length > 0).slice(0, 3)
    : [defaultConstraint]
}

const inferGoals = (value: string): string[] => {
  const explicit = extractQuotedList(value, 'goals?')
  if (explicit.length > 0) {
    return explicit
  }
  const lower = value.toLowerCase()
  const markers = [' to ', ' so that ', ' in order to ']
  for (const marker of markers) {
    const index = lower.indexOf(marker)
    if (index >= 0) {
      const goal = value
        .slice(index + marker.length)
        .replace(/\b(within|by|with no|without|no|must|cannot|can't)\b[\s\S]*$/i, '')
      const normalizedGoal = normalizePhrase(goal)
      if (normalizedGoal.length > 0) {
        return [normalizedGoal.slice(0, 180)]
      }
    }
  }
  return [defaultGoal]
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

const buildInputFromSituation = (situation: string): DecisionInput => ({
  title: buildTitleFromSituation(situation),
  context: situation.trim(),
  goals: inferGoals(situation),
  constraints: inferConstraints(situation),
  decisionType: inferDecisionType(situation),
})

const confirmOrEditInput = async (
  rl: ReturnType<typeof createInterface>
): Promise<DecisionInput> => {
  console.log('Describe your decision in one message.')
  console.log('Tip: include objective and constraints if you have them.')
  const situation = await askNonEmpty(rl, 'Situation')
  const draft = buildInputFromSituation(situation)

  printSection('Draft Brief')
  console.log(`Title: ${draft.title}`)
  console.log(`Type: ${draft.decisionType}`)
  console.log(`Goal: ${draft.goals.join(' | ')}`)
  console.log(`Constraints: ${draft.constraints.join(' | ')}`)

  const choice = (
    await rl.question('Press Enter to run, or type "edit" to refine: ')
  )
    .trim()
    .toLowerCase()
  if (choice !== '' && choice !== 'edit' && !choice.startsWith('edit')) {
    console.log('Unrecognized input. Running with draft brief.')
    return draft
  }
  if (choice === '' || choice === 'run' || choice.startsWith('run')) {
    return draft
  }

  console.log('Leave blank to keep the draft value.')
  const title = (await rl.question(`Title [${draft.title}]: `)).trim() || draft.title
  const context = (await rl.question('Context [keep draft]: ')).trim() || draft.context
  const goalInput = (await rl.question(`Goals (comma) [${draft.goals.join(', ')}]: `)).trim()
  const constraintInput = (
    await rl.question(`Constraints (comma) [${draft.constraints.join(', ')}]: `)
  ).trim()
  const typeEdit = (await rl.question('Edit decision type? [y/N]: ')).trim().toLowerCase()
  const decisionType = typeEdit === 'y' || typeEdit === 'yes' ? await askDecisionType(rl) : draft.decisionType

  return {
    title,
    context,
    goals: goalInput ? parseList(goalInput) : draft.goals,
    constraints: constraintInput ? parseList(constraintInput) : draft.constraints,
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

const printDecisionResult = (
  result: Awaited<ReturnType<typeof getDecision>>,
  includeAuditTimeline: boolean
) => {
  printSection('Decision Status')
  console.log(`ID: ${result.decision.id}`)
  console.log(`Status: ${result.decision.status}`)

  if (includeAuditTimeline) {
    printSection('Audit Timeline')
    for (const round of result.rounds) {
      console.log(`Round ${round.roundIndex} | ${round.roleKey}`)
      const parsed = parseRoundOutput(round.output)
      console.log(JSON.stringify(parsed, null, 2))
    }
  } else {
    printSection('Audit Timeline')
    console.log('Hidden in compact mode. Saved in artifact JSON.')
  }

  if (!result.record) {
    return
  }

  printSection('Detailed Record')
  console.log('Tradeoffs:')
  printList(result.record.tradeoffs)
  console.log('Risks:')
  printList(result.record.risks)
  console.log('Actions:')
  printList(result.record.actions)
  console.log(`Minority report: ${result.record.minorityReport}`)

  printSection('Final Decision')
  console.log(`Decision: ${result.record.executiveDecision.decision.toUpperCase()}`)
  console.log(`Summary: ${result.record.summary}`)
  console.log(`Rationale: ${result.record.rationale}`)
  console.log(`Confidence: ${result.record.confidence}`)
  console.log(`Stop/Go criteria: ${result.record.executiveDecision.stopGoCriteria}`)
  console.log('Why:')
  printList(result.record.executiveDecision.why)
  console.log('Top risks:')
  printList(result.record.executiveDecision.topRisks)
  console.log('Top actions:')
  printList(result.record.executiveDecision.topActions)
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
      const input = await confirmOrEditInput(rl)
      const { decisionId, result } = await runSingleDecision(input, session)
      const showAudit = (await rl.question('Show full audit timeline? [y/N]: '))
        .trim()
        .toLowerCase()
      printDecisionResult(result, showAudit === 'y' || showAudit === 'yes')
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
