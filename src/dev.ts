import { DecisionInput } from "./core"
import { createOpenAiProvider, HeuristicDebateProvider } from "./ai"
import { roleDefinitions } from "./core"
import { runDemo } from "./cli"

const provider = process.env.OPENAI_API_KEY
  ? createOpenAiProvider()
  : new HeuristicDebateProvider()

const input: DecisionInput = {
  title: "Launch a new onboarding flow",
  context: "We want to improve activation for new users.",
  goals: ["Increase activation by 15%"],
  constraints: ["Two-week implementation window"],
  decisionType: "product",
}

runDemo(input, roleDefinitions, provider)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2))
  })
  .catch((error) => {
    console.error("Demo failed", error)
    process.exitCode = 1
  })
