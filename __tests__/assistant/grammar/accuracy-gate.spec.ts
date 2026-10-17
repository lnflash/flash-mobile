import { createHash } from "crypto"

import { canonicalJson } from "@app/assistant/engine/canonical-json"
import { HELD_OUT } from "./corpus/held-out"
import { TUNING } from "./corpus/tuning"
import { describeScore, score } from "./score"

// The grammar tier's launch gate (docs/ai-assistant-tool-registry.md §7.2,
// v0.2.5): on the held-out corpus, English and Jamaican patois, which no
// rule was tuned on, at least 95% of utterances resolve as meant (intent,
// payee words, amount and currency all match, or the miss or question
// meant), and at most 0.5% resolve to a confident wrong call. A miss is
// never a wrong action: "I can't help with that yet" moves nothing. The
// numbers are logged for the PR.
//
// This is the only importer of held-out.ts (held-out-isolation.spec.ts).

const MIN_CORRECT_RATE = 0.95
const MAX_WRONG_ACTION_RATE = 0.005

/**
 * The SHA-256 of the held-out entries as canonical JSON. Any change to an
 * entry, added, removed or edited, fails the spec below: a corpus changed
 * to move the numbers measures nothing (spec §7.2). Pinned at the
 * implementer's draft plus the first and second review rounds' additions
 * (the marked blocks at its end); the owner's freeze (architect decision 5)
 * pins it again, and so must anyone who changes the set after that, saying
 * why in the commit.
 */
const HELD_OUT_SHA256 = "06ff5c28e00f7f54d7f75ac5fc87e7d87108158372434a574f4c2dde89d22d02"

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex")

describe("the grammar tier's launch gate, on the held-out corpus", () => {
  const all = score(HELD_OUT)

  it("reports its numbers, overall and per dialect", () => {
    const english = score(HELD_OUT.filter(({ dialect }) => dialect === "en"))
    const patois = score(HELD_OUT.filter(({ dialect }) => dialect === "jm"))
    console.log(
      [
        describeScore("held-out", all),
        describeScore("held-out, English", { ...english, failures: [] }),
        describeScore("held-out, Jamaican patois", { ...patois, failures: [] }),
      ].join("\n"),
    )
    // Both dialects are in it, and every one of the five intents.
    expect(english.total).toBeGreaterThan(0)
    expect(patois.total).toBeGreaterThan(0)
    const intents = new Set(
      HELD_OUT.flatMap(({ expected }) =>
        typeof expected === "string" ? [] : [expected.intent],
      ),
    )
    expect([...intents].sort()).toEqual([
      "getBalances",
      "getPrice",
      "getTransactions",
      "prepareReceive",
      "prepareSend",
    ])
  })

  it("resolves at least 95% as meant", () => {
    expect(all.correctRate).toBeGreaterThanOrEqual(MIN_CORRECT_RATE)
  })

  it("resolves at most 0.5% to a confident wrong call", () => {
    expect(all.wrongActionRate).toBeLessThanOrEqual(MAX_WRONG_ACTION_RATE)
  })
})

describe("the held-out corpus itself", () => {
  it("is the set its hash pins: a change to any entry fails here", () => {
    const pinned = sha256(canonicalJson(HELD_OUT))
    if (pinned !== HELD_OUT_SHA256) {
      // Said out loud, so the failure is read rather than re-pinned in passing.
      console.error(
        "The held-out corpus changed. It is frozen: change the tuning corpus " +
          "and the grammar to move the numbers, never this set.",
      )
    }
    expect(pinned).toBe(HELD_OUT_SHA256)
  })

  it("shares no utterance with the tuning corpus", () => {
    const tuned = new Set(TUNING.map(({ utterance }) => utterance.trim().toLowerCase()))
    expect(
      HELD_OUT.filter(({ utterance }) => tuned.has(utterance.trim().toLowerCase())),
    ).toEqual([])
  })
})
