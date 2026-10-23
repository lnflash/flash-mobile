import { platform } from "./platform"
import { AppState, Alert } from "react-native"
import { replay } from "./harness"
import type { ScenarioResult, ScenarioSuite } from "./types"

import { loadSuite, writeReport } from "../../../scripts/assistant-scenarios/library.cjs"
const options = JSON.parse(process.env.FLASH_SCENARIO_OPTIONS ?? '{"profile":"smoke"}')
const suite: ScenarioSuite = loadSuite(options)
const results: ScenarioResult[] = []
jest.setTimeout(15000)

for (const scenario of suite.scenarios) {
  it(`${scenario.id} [${scenario.layer}]`, async () => {
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: "active",
      writable: true,
    })
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const result = await replay(scenario, suite.users)
    results.push(result)
    expect(result.errors).toEqual([])
  })
}
afterAll(() => {
  const report = writeReport(
    suite,
    results,
    process.env.FLASH_SCENARIO_REPORT_DIR ?? "reports/assistant-scenarios",
  )
  expect(report.passedGate).toBe(true)
  expect(platform.publish).toBeDefined()
})
