import type {
  ScenarioResult,
  ScenarioSuite,
} from "../../__tests__/assistant/scenarios/types"
export function loadSuite(options?: {
  profile?: "smoke" | "full" | "holdout"
  seed?: number
  id?: string
  layer?: "integration" | "screen"
}): ScenarioSuite
export function writeReport(
  suite: ScenarioSuite,
  results: ScenarioResult[],
  directory: string,
): { passedGate: boolean }
