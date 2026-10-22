/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires -- Shared test tooling runs directly in Node. */
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { ROOT, hash } = require("./library.cjs")
const file = path.join(ROOT, "manifest.json")
try {
  const current = JSON.parse(fs.readFileSync(file, "utf8"))
  const [mode, value] = process.argv.slice(2)
  if (mode === "--set") {
    if (!/^\d+\.\d+\.\d+$/.test(value ?? ""))
      throw new Error("Provide a semver corpus version")
    const greater = value
      .split(".")
      .map(Number)
      .reduce(
        (decision, v, i) =>
          decision || Math.sign(v - Number(current.corpusVersion.split(".")[i])),
        0,
      )
    if (greater <= 0) throw new Error("Corpus version must increase")
    current.corpusVersion = value
    for (const name of Object.keys(current.files))
      current.files[name] = hash(fs.readFileSync(path.join(ROOT, name)))
    fs.writeFileSync(file, JSON.stringify(current, null, 2) + "\n")
    console.log(
      `Updated corpus to ${value}; review the changed data and digests together.`,
    )
  } else if (mode === "--check-base" && value) {
    const previous = spawnSync(
      "git",
      ["show", `${value}:test/assistant-scenarios/v1/manifest.json`],
      { encoding: "utf8" },
    )
    if (previous.status === 0) {
      const old = JSON.parse(previous.stdout)
      const diff = spawnSync(
        "git",
        [
          "diff",
          "--name-only",
          value,
          "--",
          "test/assistant-scenarios/v1",
          "scripts/assistant-scenarios/library.cjs",
        ],
        { encoding: "utf8" },
      )
      if (diff.status !== 0) throw new Error("Could not compare corpus changes")
      const greater = current.corpusVersion
        .split(".")
        .map(Number)
        .reduce(
          (decision, part, i) =>
            decision || Math.sign(part - Number(old.corpusVersion.split(".")[i])),
          0,
        )
      if (diff.stdout.trim() && greater <= 0)
        throw new Error("Scenario data/generator changed without a corpusVersion bump")
      console.log(`Corpus version ${current.corpusVersion} verified against base.`)
    } else {
      const base = spawnSync("git", ["cat-file", "-e", `${value}^{commit}`])
      if (base.status !== 0)
        throw new Error("Base commit unavailable; cannot verify corpus version")
      console.log("First scenario corpus on this branch.")
    }
  } else throw new Error("Use --set NEXT_VERSION or --check-base COMMIT")
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
