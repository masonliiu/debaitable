import { DecisionInput, DecisionType } from '../../core'

const defaultGoal = 'Choose the strongest path with clear tradeoffs and execution steps.'
const defaultConstraint = 'Keep scope practical for near-term execution.'

const parseList = (raw: string): string[] =>
  raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

const normalizePhrase = (value: string): string =>
  value.replace(/[?!.,;:]+$/g, '').replace(/\s+/g, ' ').trim()

const toWords = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((part) => part.length > 0)

export const inferDecisionType = (value: string): DecisionType => {
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

export const buildInputFromSituation = (situation: string): DecisionInput => ({
  title: buildTitleFromSituation(situation),
  context: situation.trim(),
  goals: inferGoals(situation),
  constraints: inferConstraints(situation),
  decisionType: inferDecisionType(situation),
})
