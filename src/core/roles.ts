import { RoleDefinition } from "./types"

export const roleDefinitions: RoleDefinition[] = [
  {
    key: "strategist",
    name: "Strategist",
    focus: "Long-term value and strategic alignment",
  },
  {
    key: "skeptic",
    name: "Skeptic",
    focus: "Challenges assumptions and surfaces weaknesses",
  },
  {
    key: "risk_analyst",
    name: "Risk Analyst",
    focus: "Failure modes, edge cases, and mitigation",
  },
  {
    key: "execution_planner",
    name: "Execution Planner",
    focus: "Steps, dependencies, and timelines",
  },
  {
    key: "cost_roi",
    name: "Cost / ROI",
    focus: "Budget constraints and return on investment",
  },
]
