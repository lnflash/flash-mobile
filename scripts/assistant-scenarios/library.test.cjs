/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires -- Shared test tooling runs directly in Node. */
const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const {
  ROOT,
  hash,
  loadSuite,
  validateScenario,
  buildReport,
  writeReport,
} = require("./library.cjs")

const goodCase = () => ({
  id: "contract-test",
  category: "navigation",
  layer: "integration",
  supported: true,
  state: {},
  steps: [{ ask: "Open contacts", expect: { kind: "screen", destination: "contacts" } }],
})
const result = (row, overrides = {}) => ({
  id: row.id,
  category: row.category,
  layer: row.layer,
  supported: row.supported,
  split: row.split,
  passed: true,
  errors: [],
  steps: row.steps.map((input) => ({
    input,
    ...("expect" in input ? { expected: input.expect, actual: input.expect } : {}),
  })),
  unexpectedSupport: 0,
  dispatches: 0,
  ...overrides,
})
function changedCorpus(t, change, refresh = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flash-corpus-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.cpSync(ROOT, root, { recursive: true })
  change(root)
  if (refresh) {
    const p = path.join(root, "manifest.json"),
      m = JSON.parse(fs.readFileSync(p))
    for (const name of Object.keys(m.files))
      m.files[name] = hash(fs.readFileSync(path.join(root, name)))
    fs.writeFileSync(p, JSON.stringify(m))
  }
  return root
}
test("seeded replay is reproducible, changes ordering, and preserves suite membership", () => {
  const a = loadSuite({ seed: 754 }),
    b = loadSuite({ seed: 754 }),
    c = loadSuite({ seed: 271828 })
  assert.deepEqual(a, b)
  assert.notDeepEqual(
    a.scenarios.map((r) => r.id),
    c.scenarios.map((r) => r.id),
  )
  assert.deepEqual(
    a.scenarios.map((r) => r.id).sort(),
    c.scenarios.map((r) => r.id).sort(),
  )
  assert.ok(a.scenarios.length >= 1300)
  assert.ok(a.scenarios.filter((r) => r.layer === "screen").length >= 12)
  assert.ok(
    loadSuite({ profile: "holdout" }).scenarios.every((r) => r.split === "holdout"),
  )
})
test("bad selectors, seeds and profiles fail rather than running zero cases", () => {
  assert.throws(() => loadSuite({ id: "does-not-exist" }), /No scenarios/)
  assert.throws(() => loadSuite({ seed: NaN }), /uint32/)
  assert.throws(() => loadSuite({ profile: "invented" }), /Unknown profile/)
  const run = spawnSync(
    process.execPath,
    [path.join(__dirname, "run.cjs"), "--scenario", "does-not-exist"],
    { encoding: "utf8" },
  )
  assert.equal(run.status, 1)
  assert.match(run.stderr, /No scenarios/)
})
test("a supported request cannot bless its support fallback as success", () => {
  const row = goodCase()
  row.steps[0].expect = { kind: "reply", replyKey: "Assistant.unknownIntent" }
  assert.throws(() => validateScenario(row), /supported requests/)
})
test("unknown expectations and multiple actions are rejected", () => {
  const row = goodCase()
  row.steps[0].expect.unexpectedDestination = "contacts"
  assert.throws(() => validateScenario(row), /unknown field/)
  assert.throws(
    () => validateScenario({ ...goodCase(), steps: [{ restart: true, ask: "Again" }] }),
    /exactly one action/,
  )
  assert.throws(
    () =>
      validateScenario({
        ...goodCase(),
        steps: [{ restart: true, expect: { kind: "help" } }],
      }),
    /only ask\/select/,
  )
})
test("a refusal card cannot satisfy an unspecified financial card expectation", () => {
  const row = goodCase()
  row.steps[0].expect = { kind: "card", intent: "prepareSend" }
  assert.throws(() => validateScenario(row), /explicit type/)
})
test("fault fixtures, counters and cancelled actions have strict contracts", () => {
  const row = goodCase()
  for (const step of [
    { fixture: {} },
    { fixture: { failServices: ["invented"] } },
    { fixture: { cashBalance: -1 } },
    { fixture: { btcState: "almost-ready" } },
    { assertReads: { wallets: -1 } },
    { assertReads: { invented: 1 } },
    { voiceFailure: "denied" },
    { contactAction: "add", username: "alice", result: "cancelled" },
  ])
    assert.throws(() => validateScenario({ ...row, steps: [step] }))
  assert.doesNotThrow(() =>
    validateScenario({ ...row, layer: "screen", steps: [{ voiceFailure: "denied" }] }),
  )
  assert.doesNotThrow(() =>
    validateScenario({
      ...row,
      steps: [{ fixture: { cashBalance: null, btcState: "failed", failServices: [] } }],
    }),
  )
})
test("coverage floors prevent losing the longer journeys or failure cases", (t) => {
  for (const [key, message] of [
    ["minimumConversationCases", /conversation coverage/],
    ["minimumFailureCases", /failure coverage/],
  ]) {
    const root = changedCorpus(t, (dir) => {
      const file = path.join(dir, "manifest.json")
      const manifest = JSON.parse(fs.readFileSync(file))
      manifest[key] = 100000
      fs.writeFileSync(file, JSON.stringify(manifest))
    })
    assert.throws(() => loadSuite({ root }), message)
  }
})
test("unknown users in mid-conversation fixtures fail before replay", (t) => {
  const root = changedCorpus(t, (dir) => {
    const file = path.join(dir, "regressions.json")
    const rows = JSON.parse(fs.readFileSync(file))
    rows[0].steps.push({ fixture: { unverifiedUsers: ["invented"] } })
    fs.writeFileSync(file, JSON.stringify(rows))
  })
  assert.throws(() => loadSuite({ root }), /unknown fixture user/)
})
test("unsupported schema versions and unversioned content tampering fail closed", (t) => {
  let root = changedCorpus(t, (dir) => {
    const p = path.join(dir, "manifest.json"),
      m = JSON.parse(fs.readFileSync(p))
    m.schemaVersion = 2
    fs.writeFileSync(p, JSON.stringify(m))
  })
  assert.throws(() => loadSuite({ root }), /schemaVersion/)
  root = changedCorpus(
    t,
    (dir) => fs.appendFileSync(path.join(dir, "regressions.json"), " "),
    false,
  )
  assert.throws(() => loadSuite({ root }), /content changed/)
})
test("duplicate ids cannot hide a missing scenario behind the same result", (t) => {
  const root = changedCorpus(t, (dir) => {
    const p = path.join(dir, "regressions.json"),
      rows = JSON.parse(fs.readFileSync(p))
    rows.push(rows[0])
    fs.writeFileSync(p, JSON.stringify(rows))
  })
  assert.throws(() => loadSuite({ root }), /Duplicate scenario/)
})
test("incomplete results, unexpected handoffs and any financial dispatch fail the report gate", () => {
  const suite = loadSuite({ profile: "smoke" })
  const rows = suite.scenarios.map((s) => result(s))
  assert.throws(() => buildReport(suite, rows.slice(1)), /Incomplete/)
  assert.throws(
    () =>
      buildReport(
        suite,
        rows.map((row, i) => (i ? row : { ...row, steps: [] })),
      ),
    /Incomplete step/,
  )
  assert.equal(buildReport(suite, rows).passedGate, true)
  assert.equal(
    buildReport(
      suite,
      rows.map((r, i) => (i ? r : { ...r, dispatches: 1 })),
    ).passedGate,
    false,
  )
  assert.equal(
    buildReport(
      suite,
      rows.map((r, i) => (i ? r : { ...r, unexpectedSupport: 1 })),
    ).passedGate,
    false,
  )
  assert.throws(
    () =>
      buildReport(
        suite,
        rows.map((r, i) => (i ? r : { ...r, errors: ["failed"] })),
      ),
    /Inconsistent/,
  )
})
test("reports retain failure inputs, state-independent replay commands and unsupported ASR scope", (t) => {
  const suite = loadSuite({ id: "max-legacy-lookup" })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-report-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const report = writeReport(
    suite,
    [result(suite.scenarios[0], { passed: false, errors: ["missing suggestion"] })],
    dir,
  )
  assert.equal(report.passedGate, false)
  assert.match(
    fs.readFileSync(path.join(dir, "report.md"), "utf8"),
    /--scenario max-legacy-lookup --seed 754/,
  )
  assert.match(report.nativeSpeechRecognition, /not-tested/)
  assert.equal(report.selection.fullCoverage, false)
})

test("the version command rejects corpus changes until the version and digests increase", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flash-version-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.cpSync(__dirname, path.join(root, "scripts/assistant-scenarios"), {
    recursive: true,
  })
  fs.cpSync(ROOT, path.join(root, "test/assistant-scenarios/v1"), { recursive: true })
  const git = (args) => {
    const run = spawnSync("git", args, { cwd: root, encoding: "utf8" })
    assert.equal(run.status, 0, run.stderr)
    return run.stdout.trim()
  }
  git(["init", "--quiet"])
  git(["add", "."])
  git([
    "-c",
    "user.name=Scenario Test",
    "-c",
    "user.email=scenario@example.test",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ])
  const base = git(["rev-parse", "HEAD"])
  const version = (args) =>
    spawnSync(
      process.execPath,
      [path.join(root, "scripts/assistant-scenarios/version.cjs"), ...args],
      { cwd: root, encoding: "utf8" },
    )
  assert.equal(version(["--check-base", base]).status, 0)
  fs.appendFileSync(path.join(root, "test/assistant-scenarios/v1/regressions.json"), " ")
  assert.equal(version(["--check-base", base]).status, 1)
  const initial = loadSuite().corpusVersion
  const parts = initial.split(".").map(Number)
  parts[2] += 1
  assert.equal(version(["--set", parts.join(".")]).status, 0)
  assert.equal(version(["--check-base", base]).status, 0)
  assert.equal(version(["--set", initial]).status, 1)
})
