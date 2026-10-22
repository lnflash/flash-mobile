/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires -- Shared test tooling runs directly in Node. */
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")

const ROOT = path.resolve(__dirname, "../../test/assistant-scenarios/v1")
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex")
const requireThat = (condition, message) => {
  if (!condition) throw new Error(message)
}
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)
const keys = (value, allowed, where) => {
  requireThat(object(value), `${where}: expected an object`)
  for (const key of Object.keys(value))
    requireThat(allowed.includes(key), `${where}: unknown field ${key}`)
}

function validateScenario(row) {
  keys(
    row,
    ["id", "category", "layer", "supported", "state", "steps", "source", "split"],
    "scenario",
  )
  requireThat(/^[a-z0-9][a-z0-9.-]+$/.test(row.id), "scenario: invalid stable id")
  requireThat(
    typeof row.category === "string" && row.category.length,
    `${row.id}: missing category`,
  )
  requireThat(["integration", "screen"].includes(row.layer), `${row.id}: invalid layer`)
  requireThat(typeof row.supported === "boolean", `${row.id}: supported must be explicit`)
  keys(
    row.state,
    [
      "offline",
      "contacts",
      "chatContacts",
      "history",
      "legacyLookups",
      "recent",
      "legacyIndex",
      "scope",
      "displayCurrency",
      "lookupFails",
      "voiceAvailable",
    ],
    row.id,
  )
  for (const key of [
    "contacts",
    "chatContacts",
    "history",
    "legacyLookups",
    "recent",
    "legacyIndex",
  ])
    if (key in row.state)
      requireThat(
        Array.isArray(row.state[key]) &&
          row.state[key].every((v) => typeof v === "string"),
        `${row.id}: invalid ${key}`,
      )
  for (const key of ["offline", "lookupFails", "voiceAvailable"])
    if (key in row.state)
      requireThat(typeof row.state[key] === "boolean", `${row.id}: invalid ${key}`)
  if ("scope" in row.state)
    requireThat(
      typeof row.state.scope === "string" && row.state.scope,
      `${row.id}: invalid scope`,
    )
  if ("displayCurrency" in row.state)
    requireThat(
      ["USD", "JMD"].includes(row.state.displayCurrency),
      `${row.id}: invalid display currency`,
    )
  requireThat(Array.isArray(row.steps) && row.steps.length > 0, `${row.id}: empty steps`)
  for (const step of row.steps) {
    keys(
      step,
      [
        "ask",
        "intended",
        "origin",
        "expect",
        "select",
        "restart",
        "offline",
        "switchAccount",
        "contactAction",
        "username",
        "openSupport",
        "toggleWallet",
        "voiceUnavailable",
      ],
      row.id,
    )
    const actions = [
      "ask",
      "select",
      "restart",
      "offline",
      "switchAccount",
      "contactAction",
      "openSupport",
      "toggleWallet",
      "voiceUnavailable",
    ].filter((key) => key in step)
    requireThat(actions.length === 1, `${row.id}: each step must have exactly one action`)
    requireThat(
      "expect" in step === ("ask" in step || "select" in step),
      `${row.id}: only ask/select steps require an expectation`,
    )
    if ("intended" in step)
      requireThat(
        "ask" in step && typeof step.intended === "string",
        `${row.id}: invalid intended phrase`,
      )
    if ("origin" in step)
      requireThat("ask" in step, `${row.id}: origin requires an ask step`)
    if ("username" in step)
      requireThat(
        "contactAction" in step,
        `${row.id}: username requires a contact action`,
      )
    if ("ask" in step || "select" in step) {
      requireThat(
        typeof (step.ask ?? step.select) === "string" && (step.ask ?? step.select).trim(),
        `${row.id}: empty input`,
      )
      keys(
        step.expect,
        [
          "kind",
          "topic",
          "destination",
          "replyKey",
          "operation",
          "query",
          "lookup",
          "usernames",
          "username",
          "cardType",
          "amount",
          "intent",
          "stale",
        ],
        row.id,
      )
      requireThat(
        [
          "help",
          "screen",
          "reply",
          "contact",
          "card",
          "balances",
          "address",
          "transactions",
          "price",
          "limits",
          "conversionAmount",
          "cashoutAmount",
          "cardTopUp",
          "merchants",
        ].includes(step.expect.kind),
        `${row.id}: invalid outcome`,
      )
      for (const key of [
        "topic",
        "destination",
        "replyKey",
        "query",
        "username",
        "cardType",
        "amount",
        "intent",
      ])
        if (key in step.expect)
          requireThat(
            typeof step.expect[key] === "string",
            `${row.id}: invalid expected ${key}`,
          )
      if (step.expect.kind === "help")
        requireThat(Boolean(step.expect.topic), `${row.id}: missing help topic`)
      if (step.expect.kind === "screen")
        requireThat(Boolean(step.expect.destination), `${row.id}: missing destination`)
      if (step.expect.kind === "reply")
        requireThat(Boolean(step.expect.replyKey), `${row.id}: missing replyKey`)
      if (step.expect.kind === "card")
        requireThat(
          Boolean(step.expect.cardType),
          `${row.id}: cards need an explicit type; refusal is not completion`,
        )
      if (step.expect.cardType === "confirmPayment") {
        requireThat(
          typeof step.expect.amount === "string" &&
            typeof step.expect.intent === "string",
          `${row.id}: payment reviews require intent and amount`,
        )
        if (step.expect.intent === "prepareSend")
          requireThat(
            typeof step.expect.username === "string",
            `${row.id}: payment reviews require a recipient`,
          )
      }
      if (step.expect.kind === "contact") {
        requireThat(
          ["add", "remove", "profile"].includes(step.expect.operation),
          `${row.id}: invalid operation`,
        )
        requireThat(
          typeof step.expect.query === "string",
          `${row.id}: missing contact query`,
        )
        requireThat(
          ["exact", "suggestions", "missing", "error"].includes(step.expect.lookup),
          `${row.id}: invalid lookup`,
        )
      }
      if ("usernames" in step.expect)
        requireThat(
          Array.isArray(step.expect.usernames) &&
            step.expect.usernames.every((v) => typeof v === "string"),
          `${row.id}: invalid usernames`,
        )
      if ("stale" in step.expect)
        requireThat(
          typeof step.expect.stale === "boolean",
          `${row.id}: invalid stale flag`,
        )
      if ("origin" in step)
        requireThat(["text", "voice"].includes(step.origin), `${row.id}: invalid origin`)
      if (row.supported)
        requireThat(
          !["Assistant.unknownIntent", "Assistant.notYetAvailable"].includes(
            step.expect.replyKey,
          ),
          `${row.id}: supported requests cannot expect a support fallback`,
        )
    }
    if ("contactAction" in step)
      requireThat(
        row.layer === "screen" &&
          ["add", "remove"].includes(step.contactAction) &&
          typeof step.username === "string",
        `${row.id}: invalid contact action`,
      )
    if ("openSupport" in step || "toggleWallet" in step || "voiceUnavailable" in step)
      requireThat(
        row.layer === "screen",
        `${row.id}: button presses require screen replay`,
      )
    for (const key of ["restart", "openSupport", "voiceUnavailable"])
      if (key in step) requireThat(step[key] === true, `${row.id}: invalid ${key}`)
    for (const key of ["offline", "toggleWallet"])
      if (key in step)
        requireThat(typeof step[key] === "boolean", `${row.id}: invalid ${key}`)
    if ("switchAccount" in step)
      requireThat(
        typeof step.switchAccount === "string" && step.switchAccount,
        `${row.id}: invalid account switch`,
      )
  }
  return row
}

function expand(matrix) {
  const rows = []
  /* eslint-disable max-params -- Each matrix row declares its complete scenario contract. */
  const add = (
    id,
    category,
    text,
    expect,
    state = {},
    origin = "text",
    supported = true,
  ) =>
    rows.push({
      id,
      category,
      layer: "integration",
      supported,
      split: "generated",
      state,
      steps: [{ ask: text, origin, expect }],
    })
  /* eslint-enable max-params */
  for (const offline of [false, true])
    for (const origin of ["text", "voice"]) {
      const suffix = `${offline ? "offline" : "online"}.${origin}`
      matrix.wallet.forEach(([text, destination], i) =>
        add(
          `wallet.${i}.${suffix}`,
          "wallet",
          text,
          { kind: "screen", destination },
          { offline },
          origin,
        ),
      )
      matrix.screens.forEach(([name, destination], i) =>
        matrix.navigation.forEach((phrase, j) =>
          add(
            `nav.${i}.${j}.${suffix}`,
            "navigation",
            phrase.replace("{name}", name),
            { kind: "screen", destination },
            { offline },
            origin,
          ),
        ),
      )
      matrix.help.forEach(([text, topic], i) =>
        [text, text.replace(/[?.!]+$/, "") + " again?"].forEach((phrase, j) =>
          add(
            `help.${i}.${j}.${suffix}`,
            "help",
            phrase,
            { kind: "help", topic },
            { offline },
            origin,
          ),
        ),
      )
      matrix.unknown.forEach((text, i) =>
        add(
          `unsupported.${i}.${suffix}`,
          "support",
          text,
          { kind: "reply", replyKey: "Assistant.unknownIntent" },
          { offline },
          origin,
          false,
        ),
      )
      matrix.guards.forEach((text, i) =>
        add(
          `guard.${i}.${suffix}`,
          "safety",
          text,
          { kind: "reply", replyKey: "Assistant.unknownIntent" },
          { offline },
          origin,
          false,
        ),
      )
    }
  for (const origin of ["text", "voice"])
    matrix.people.forEach(([username, ...heard], i) => {
      ;[...new Set([username, ...heard])].forEach((name, j) =>
        matrix.sources.forEach((source, k) =>
          matrix.contacts.forEach(([phrase, operation], n) =>
            add(
              `person.${i}.${j}.${k}.${n}.${origin}`,
              "username",
              phrase.replace("{name}", name),
              {
                kind: "contact",
                operation,
                query: name.toLowerCase(),
                lookup: name === username ? "exact" : "suggestions",
                usernames: [username],
              },
              { [source]: [username] },
              origin,
            ),
          ),
        ),
      )
    })
  for (const offline of [false, true])
    for (const origin of ["text", "voice"])
      matrix.payments.forEach(([phrase, amount], i) =>
        ["alice", "maria_s", "alex7"].forEach((username, j) =>
          add(
            `payment.${i}.${j}.${offline ? "offline" : "online"}.${origin}`,
            "payment",
            phrase.replace("{name}", username),
            offline
              ? { kind: "reply", replyKey: "Assistant.actionsOffline" }
              : {
                  kind: "card",
                  cardType: "confirmPayment",
                  intent: "prepareSend",
                  username,
                  amount,
                },
            { offline, contacts: [username] },
            origin,
          ),
        ),
      )
  return rows
}

function loadSuite({ root = ROOT, profile = "full", seed = 754, id, layer } = {}) {
  requireThat(
    ["smoke", "full", "holdout"].includes(profile),
    `Unknown profile: ${profile}`,
  )
  requireThat(
    Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff,
    "Seed must be a uint32",
  )
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"))
  requireThat(manifest.schemaVersion === 1, "Unsupported scenario schemaVersion")
  requireThat(/^\d+\.\d+\.\d+$/.test(manifest.corpusVersion), "Invalid corpusVersion")
  const data = {}
  for (const name of [
    "fixtures.json",
    "regressions.json",
    "holdout.json",
    "matrices.json",
  ]) {
    const raw = fs.readFileSync(path.join(root, name))
    requireThat(
      manifest.files[name] === hash(raw),
      `${name}: content changed; bump corpusVersion and update its manifest digest`,
    )
    data[name] = JSON.parse(raw)
  }
  const users = data["fixtures.json"].users
  requireThat(object(users) && Object.keys(users).length > 0, "Missing fixture users")
  for (const [name, user] of Object.entries(users))
    requireThat(
      /^[a-z0-9_]{3,50}$/.test(name) && /^[0-9a-f]{64}$/.test(user.pubkey),
      `Invalid fixture user: ${name}`,
    )
  const rows = [
    ...data["regressions.json"].map((r) => ({ ...r, split: "regression" })),
    ...data["holdout.json"].map((r) => ({ ...r, split: "holdout" })),
    ...expand(data["matrices.json"]),
  ]
  requireThat(
    rows.length >= manifest.minimumFullCases,
    "Corpus is below its minimum full coverage",
  )
  requireThat(
    rows.filter((r) => r.layer === "screen").length >= manifest.minimumScreenCases,
    "Corpus is below its minimum screen coverage",
  )
  requireThat(
    rows.filter((r) => r.split === "holdout").length >= manifest.minimumHoldoutCases,
    "Corpus is below its minimum heldout coverage",
  )
  const ids = new Set()
  for (const row of rows) {
    validateScenario(row)
    requireThat(!ids.has(row.id), `Duplicate scenario id: ${row.id}`)
    ids.add(row.id)
    for (const field of [
      "contacts",
      "chatContacts",
      "history",
      "legacyLookups",
      "recent",
      "legacyIndex",
    ])
      for (const name of row.state[field] ?? [])
        requireThat(name in users, `${row.id}: unknown fixture user ${name}`)
  }
  let selected = rows.filter(
    (r) =>
      profile === "full" ||
      (profile === "smoke" ? r.split === "regression" : r.split === "holdout"),
  )
  if (id) selected = selected.filter((r) => r.id === id)
  if (layer) {
    requireThat(["integration", "screen"].includes(layer), "Invalid layer")
    selected = selected.filter((r) => r.layer === layer)
  }
  requireThat(selected.length > 0, "No scenarios selected; refusing an empty green run")
  // Seed affects execution order, never the expected answers or corpus membership.
  let next = seed
  for (let i = selected.length - 1; i > 0; i -= 1) {
    next = (next * 1664525 + 1013904223) % 4294967296
    const j = next % (i + 1)
    ;[selected[i], selected[j]] = [selected[j], selected[i]]
  }
  return {
    schemaVersion: 1,
    corpusVersion: manifest.corpusVersion,
    digest: hash(JSON.stringify(manifest) + fs.readFileSync(__filename, "utf8")),
    seed,
    selection: {
      profile,
      id: id ?? null,
      layer: layer ?? null,
      fullCoverage: profile === "full" && !id && !layer,
    },
    scenarios: selected,
    users,
  }
}

function buildReport(suite, results) {
  const scenarios = new Map(suite.scenarios.map((row) => [row.id, row]))
  const expected = new Set(suite.scenarios.map((r) => r.id))
  requireThat(
    results.length === expected.size &&
      new Set(results.map((r) => r.id)).size === expected.size &&
      results.every((r) => expected.has(r.id)),
    "Incomplete or duplicate scenario results",
  )
  requireThat(
    results.every((r) => Array.isArray(r.errors) && r.passed === (r.errors.length === 0)),
    "Inconsistent scenario verdict",
  )
  requireThat(
    results.every(
      (row) => !row.passed || row.steps.length === scenarios.get(row.id).steps.length,
    ),
    "Incomplete step results",
  )
  requireThat(
    results.every((row) =>
      [row.dispatches, row.unexpectedSupport].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      ),
    ),
    "Invalid outcome counters",
  )
  const count = (rows) => ({
    total: rows.length,
    passed: rows.filter((r) => r.passed).length,
    failed: rows.filter((r) => !r.passed).length,
  })
  const by = (key) =>
    Object.fromEntries(
      [...new Set(results.map((r) => r[key]))]
        .sort()
        .map((value) => [value, count(results.filter((r) => r[key] === value))]),
    )
  const dispatches = results.reduce((n, r) => n + r.dispatches, 0)
  const unexpectedSupport = results.reduce((n, r) => n + r.unexpectedSupport, 0)
  return {
    schemaVersion: 1,
    corpusVersion: suite.corpusVersion,
    corpusDigest: suite.digest,
    seed: suite.seed,
    selection: suite.selection,
    ...count(results),
    supported: count(results.filter((r) => r.supported)),
    byCategory: by("category"),
    byLayer: by("layer"),
    bySplit: by("split"),
    unexpectedSupport,
    unintendedDispatches: dispatches,
    passedGate:
      results.every((r) => r.passed) && dispatches === 0 && unexpectedSupport === 0,
    nativeSpeechRecognition:
      "not-tested; recorded text/transcripts are replayed without running an ASR engine",
    results: results.map((row) => ({
      ...row,
      initialState: scenarios.get(row.id).state,
      source: scenarios.get(row.id).source,
    })),
  }
}

function writeReport(suite, results, directory) {
  const report = buildReport(suite, results)
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(
    path.join(directory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  )
  const lines = [
    `# Ask Flash scenarios ${suite.corpusVersion}`,
    "",
    `Seed: ${suite.seed} · Corpus: ${suite.digest}`,
    "",
    `**${report.passed}/${report.total} passed** · Unexpected support: ${report.unexpectedSupport} · Unintended dispatches: ${report.unintendedDispatches}`,
    "",
    "| Category | Passed | Failed |",
    "| --- | ---: | ---: |",
    ...Object.entries(report.byCategory).map(
      ([key, v]) => `| ${key} | ${v.passed} | ${v.failed} |`,
    ),
    "",
    "Native speech recognition is not measured by transcript replay.",
    "",
  ]
  for (const row of report.results.filter((r) => !r.passed))
    lines.push(
      `## ${row.id}`,
      "",
      "```json",
      JSON.stringify(row, null, 2),
      "```",
      "",
      `Replay: yarn test:assistant-scenarios --scenario ${row.id} --seed ${suite.seed}`,
      "",
    )
  fs.writeFileSync(path.join(directory, "report.md"), lines.join("\n"))
  return report
}
module.exports = {
  ROOT,
  hash,
  validateScenario,
  expand,
  loadSuite,
  buildReport,
  writeReport,
}
