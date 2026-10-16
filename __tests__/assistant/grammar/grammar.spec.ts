import * as amountPhrase from "@app/assistant/engine/amount-phrase"
import { routeIntent } from "@app/assistant/engine/intent-router"
import { GRAMMAR_RULES, matchGrammar } from "@app/assistant/grammar"
import { normalize, textOf, WORD_FOLDS } from "@app/assistant/grammar/normalize"
import type { GrammarRule } from "@app/assistant/grammar/types"
import { assistantRegistry } from "@app/assistant/registry"
import { TUNING } from "./corpus/tuning"

// The grammar tier's own mechanics (app/assistant/grammar): how it reads
// words, what it never takes, and that what it emits is a call runTool
// takes as any model's (docs/ai-assistant-tool-registry.md §7.2).

const USD = { displayCurrency: "USD", displaySymbol: "$" }
const JMD = { displayCurrency: "JMD", displaySymbol: "J$" }

afterEach(() => jest.restoreAllMocks())

describe("normalize", () => {
  it("lower-cases, drops sentence punctuation, apostrophes and hyphens, keeps amounts whole", () => {
    expect(textOf(normalize("  What's my BALANCE?! ").tokens)).toBe("what my balance")
    expect(textOf(normalize("Send $1,250.75 to Bob.").tokens)).toBe(
      "send $1,250.75 to bob",
    )
    expect(textOf(normalize("my on-chain address, please").tokens)).toBe(
      "my onchain address please",
    )
    expect(textOf(normalize("“send $.50 to bob”").tokens)).toBe("send $.50 to bob")
  })

  it("folds patois and chat forms into the words the rules know", () => {
    expect(textOf(normalize("wah mi balance").tokens)).toBe("what my balance")
    expect(textOf(normalize("sen 500 fi mom").tokens)).toBe("send 500 to mom")
    expect(textOf(normalize("gi mi a invoice").tokens)).toBe("give my a invoice")
    expect(textOf(normalize("send 5 us dollars").tokens)).toBe("send 5 usd")
    // The folds are data a reviewer reads in one place.
    expect(WORD_FOLDS).toMatchObject({ mi: "my", wah: "what", sen: "send" })
  })

  it("keeps each word as typed, for names and memos", () => {
    expect(normalize("Sen Fi $5!").tokens).toEqual([
      { word: "send", raw: "Sen" },
      { word: "to", raw: "Fi" },
      { word: "$5", raw: "$5" },
    ])
  })
})

describe("matchGrammar", () => {
  it("never makes a call of an invoice, an address, a Lightning address or a link", () => {
    ;[
      "pay lnbc10u1pjexampleinvoice",
      "send $5 to bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      "send $5 to bob@flashapp.me",
      "pay lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35x",
      "send $5 to https://flashapp.me/bob",
      "show my balance bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    ].forEach((utterance) =>
      expect([utterance, matchGrammar(utterance, USD)]).toEqual([utterance, undefined]),
    )
  })

  it("never makes a call of a question about how the app works", () => {
    ;[
      "how do I send money",
      "how to get paid",
      "why is my balance low",
      "is bitcoin up",
    ].forEach((utterance) =>
      expect([utterance, matchGrammar(utterance, USD)]).toEqual([utterance, undefined]),
    )
  })

  it("answers nothing for nothing", () => {
    expect(matchGrammar("", USD)).toBeUndefined()
    expect(matchGrammar("   ?! ", USD)).toBeUndefined()
    expect(matchGrammar("please", USD)).toBeUndefined()
  })

  it("takes every amount from readAmountPhrase, never reading one itself", () => {
    const read = jest
      .spyOn(amountPhrase, "readAmountPhrase")
      .mockReturnValue({ kind: "amount", amount: "42", currency: "USDT" })

    expect(matchGrammar("send $5 to bob", JMD)).toEqual({
      kind: "call",
      call: {
        intent: "prepareSend",
        args: { payee: "bob", amount: "42", currency: "USDT" },
      },
    })
    expect(read).toHaveBeenCalledWith("$5", JMD)

    read.mockReturnValue({ kind: "clarify", reason: "unit" })
    expect(matchGrammar("request 500", JMD)).toEqual({
      kind: "clarifyAmount",
      reason: "unit",
    })
    expect(read).toHaveBeenLastCalledWith("500", JMD)
  })

  it("asks about an amount it was not given, rather than send without one", () => {
    expect(matchGrammar("send money to mom", USD)).toEqual({
      kind: "clarifyAmount",
      reason: "missing",
    })
  })

  it("lets a rule end the search with no match: a refused send is no one else's", () => {
    // "send him my balance" names a balance, but it is a send to a pronoun.
    expect(matchGrammar("send him my balance", USD)).toBeUndefined()
    const refuses: GrammarRule = {
      name: "test.refuses",
      intent: "prepareSend",
      match: () => ({ kind: "refuse" }),
    }
    expect(matchGrammar("my balance", USD, [refuses, ...GRAMMAR_RULES])).toBeUndefined()
    expect(matchGrammar("my balance", USD)).toEqual({
      kind: "call",
      call: { intent: "getBalances", args: {} },
    })
  })

  it("orders its rules most specific first, one block per intent", () => {
    expect([...new Set(GRAMMAR_RULES.map(({ intent }) => intent))]).toEqual([
      "prepareSend",
      "prepareReceive",
      "getTransactions",
      "getPrice",
      "getBalances",
    ])
  })

  it("emits only calls the router accepts, as it would any model's", () => {
    // runTool routes the grammar's call unchanged (spec §7.2): every call
    // over the tuning corpus passes the registry's schemas.
    const calls = TUNING.flatMap((entry) => {
      const match = matchGrammar(entry.utterance, {
        displayCurrency: entry.displayCurrency,
        displaySymbol: entry.displayCurrency === "USD" ? "$" : "J$",
      })
      return match?.kind === "call" ? [match.call] : []
    })
    expect(calls.length).toBeGreaterThan(200)

    const refused = calls.filter((call) => !routeIntent(call, assistantRegistry).ok)
    expect(refused).toEqual([])
  })
})
