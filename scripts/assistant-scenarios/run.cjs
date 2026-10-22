/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires -- Shared test tooling runs directly in Node. */
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { loadSuite } = require("./library.cjs")

try {
  const args = process.argv.slice(2)
  const options = { profile: "full", seed: 754 }
  const flags = {
    "--profile": "profile",
    "--seed": "seed",
    "--scenario": "id",
    "--layer": "layer",
    "--report-dir": "reportDir",
  }
  let list = false
  for (let i = 0; i < args.length; i += 1) {
    const argument = args[i]
    if (argument === "--list") list = true
    else if (argument === "--help") {
      console.log(
        "yarn test:assistant-scenarios [--profile smoke|full|holdout] [--scenario ID] [--layer integration|screen] [--seed UINT32] [--report-dir PATH] [--list]",
      )
      process.exit(0)
    } else {
      const key = flags[argument]
      if (!key || !args[i + 1] || args[i + 1].startsWith("--"))
        throw new Error(`Invalid argument: ${argument}`)
      i += 1
      options[key] = key === "seed" ? Number(args[i]) : args[i]
    }
  }
  const suite = loadSuite(options)
  if (list) {
    console.log(
      suite.scenarios.map((r) => `${r.id}\t${r.layer}\t${r.category}`).join("\n"),
    )
    process.exit(0)
  }
  const directory = path.resolve(options.reportDir ?? "reports/assistant-scenarios")
  fs.mkdirSync(directory, { recursive: true })
  // An old passing report cannot turn a crashed or empty run green.
  for (const name of ["report.json", "report.md"])
    fs.rmSync(path.join(directory, name), { force: true })
  console.log(
    `Ask Flash corpus ${suite.corpusVersion}: ${suite.scenarios.length} scenarios, seed ${suite.seed}`,
  )
  const result = spawnSync(
    process.execPath,
    [
      require.resolve("jest/bin/jest"),
      "--runInBand",
      "--verbose=false",
      "--runTestsByPath",
      "__tests__/assistant/scenarios/replay.spec.tsx",
    ],
    {
      cwd: path.resolve(__dirname, "../.."),
      stdio: "inherit",
      timeout: 240000,
      env: {
        ...process.env,
        FLASH_SCENARIO_OPTIONS: JSON.stringify(options),
        FLASH_SCENARIO_REPORT_DIR: directory,
      },
    },
  )
  if (result.error) throw result.error
  const report = JSON.parse(fs.readFileSync(path.join(directory, "report.json"), "utf8"))
  console.log(
    `${report.passed}/${report.total} passed. Report: ${path.join(
      directory,
      "report.md",
    )}`,
  )
  process.exit(result.status === 0 && report.passedGate ? 0 : 1)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
