import { HELD_OUT } from "./corpus/held-out"
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
