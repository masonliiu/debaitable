import { StaticLlmProvider } from "./ai"
import { roleDefinitions } from "./core"
import { runDemo } from "./cli"

const buildResponses = () => {
  const responses = [] as {
    output: unknown
    raw: string
    model: string
  }[]

  for (const role of roleDefinitions) {
    responses.push({
      output: {
        roleKey: role.key,
        summary: `${role.name} summary`,
        recommendation: `${role.name} recommendation`,
        rationale: `${role.name} rationale`,
        risks: [`${role.name} risk`],
        assumptions: [`${role.name} assumption`],
        actions: [`${role.name} action`],
      },
      raw: "{}",
      model: "mock",
    })
  }

  for (const role of roleDefinitions) {
    responses.push({
      output: {
        roleKey: role.key,
        critiques: [`${role.name} critique`],
        rebuttals: [`${role.name} rebuttal`],
        openQuestions: [`${role.name} question`],
      },
      raw: "{}",
      model: "mock",
    })
  }

  for (const role of roleDefinitions) {
    responses.push({
      output: {
        roleKey: role.key,
        vote: "support",
        reasons: [`${role.name} reason`],
        conditions: [],
      },
      raw: "{}",
      model: "mock",
    })
  }

  responses.push({
    output: {
      summary: "Final summary",
      rationale: "Final rationale",
      tradeoffs: ["Tradeoff"],
      risks: ["Risk"],
      actions: ["Action"],
      confidence: 0.7,
      minorityReport: "No minority report",
    },
    raw: "{}",
    model: "mock",
  })

  return responses
}

const provider = new StaticLlmProvider(buildResponses())

const input = {
  title: "Launch a new onboarding flow",
  context: "We want to improve activation for new users.",
  goals: ["Increase activation by 15%"],
  constraints: ["Two-week implementation window"],
  decisionType: "product",
} as const

runDemo(input, roleDefinitions, provider)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2))
  })
  .catch((error) => {
    console.error("Demo failed", error)
    process.exitCode = 1
  })
