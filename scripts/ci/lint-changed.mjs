#!/usr/bin/env node
// Lint only the lines a PR/push actually changes.
//
// The repo carries a large amount of pre-existing lint debt, so a whole-file
// (or whole-repo) `eslint` gate fails on untouched legacy code the moment a PR
// edits any part of such a file. This runs ESLint on the changed files but only
// fails on error-severity messages that land on added/modified lines, so a PR
// is judged solely on the code it introduces.
//
// Base commit comes from $BASE_SHA (the workflow computes it for PR vs push).
import { execSync } from "node:child_process"

const base = process.env.BASE_SHA
if (!base) {
  console.error("BASE_SHA is not set")
  process.exit(1)
}

const sh = (cmd) => execSync(cmd, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })

const files = sh(
  `git diff --name-only --diff-filter=ACMR ${base}...HEAD -- "*.js" "*.jsx" "*.ts" "*.tsx"`,
)
  .split("\n")
  .filter(Boolean)

if (files.length === 0) {
  console.log("No JS/TS files changed; skipping ESLint.")
  process.exit(0)
}
console.log("Changed JS/TS files:\n" + files.map((f) => "  " + f).join("\n"))

// Added/modified line numbers (new side) per file, parsed from a zero-context diff.
const changedLines = {}
for (const f of files) {
  const diff = sh(`git diff --unified=0 ${base}...HEAD -- "${f}"`)
  const set = new Set()
  const re = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm
  let m
  while ((m = re.exec(diff))) {
    const start = Number(m[1])
    const count = m[2] === undefined ? 1 : Number(m[2])
    for (let i = 0; i < count; i++) set.add(start + i)
  }
  changedLines[f] = set
}

// Run ESLint over the changed files and read JSON, regardless of exit code
// (ESLint exits non-zero when it finds problems; the JSON is still on stdout).
let results = []
const eslintCmd = `yarn --silent eslint --format json ${files.map((f) => `"${f}"`).join(" ")}`
try {
  const out = sh(eslintCmd)
  results = JSON.parse(out.slice(out.indexOf("[")))
} catch (e) {
  const out = (e.stdout || "").toString()
  const start = out.indexOf("[")
  if (start < 0) {
    console.error("ESLint did not produce JSON output (config error or crash):")
    console.error((e.stderr || "").toString() || out)
    process.exit(1)
  }
  results = JSON.parse(out.slice(start))
}

const cwd = process.cwd()
let failures = 0
for (const r of results) {
  const rel = r.filePath.startsWith(cwd) ? r.filePath.slice(cwd.length + 1) : r.filePath
  const lines = changedLines[rel]
  if (!lines) continue
  for (const msg of r.messages) {
    if (msg.severity === 2 && lines.has(msg.line)) {
      failures++
      console.log(
        `::error file=${rel},line=${msg.line},col=${msg.column}::${msg.ruleId || "eslint"}: ${msg.message}`,
      )
    }
  }
}

if (failures > 0) {
  console.log(`\n${failures} ESLint error(s) on changed lines.`)
  process.exit(1)
}
console.log("\nNo ESLint errors on changed lines.")
