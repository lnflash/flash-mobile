import * as amountPhrase from "@app/assistant/engine/amount-phrase"
import { routeIntent } from "@app/assistant/engine/intent-router"
import { GRAMMAR_RULES, matchGrammar, readGrammar } from "@app/assistant/grammar"
import { normalize, textOf, WORD_FOLDS } from "@app/assistant/grammar/normalize"
import type { GrammarRule } from "@app/assistant/grammar/types"
import { assistantRegistry } from "@app/assistant/registry"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { TUNING } from "./corpus/tuning"

loadLocale("en")

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

  it("keeps the hyphens and apostrophes of a word with a digit, for readAmountPhrase", () => {
    // An amount is read only by readAmountPhrase, from what was typed:
    // "5-10" is two numbers there, never "510".
    expect(textOf(normalize("send bob 5-10").tokens)).toBe("send bob 5-10")
    expect(textOf(normalize("send -5 to bob").tokens)).toBe("send -5 to bob")
    expect(textOf(normalize("send 5'000 to bob").tokens)).toBe("send 5'000 to bob")
    // A word with no digit still loses them.
    expect(textOf(normalize("D'Andre on-chain").tokens)).toBe("dandre onchain")
  })

  it("reads & and + standing alone as and", () => {
    expect(textOf(normalize("send 20 to mom & dad").tokens)).toBe(
      "send 20 to mom and dad",
    )
    expect(textOf(normalize("send 20 to mom + dad").tokens)).toBe(
      "send 20 to mom and dad",
    )
    // Inside a word, either is part of it.
    expect(textOf(normalize("send 5+5 to bob").tokens)).toBe("send 5+5 to bob")
  })

  it("marks a word a comma ended, whether the comma touches it or stands apart", () => {
    expect(normalize("mom, dad").tokens).toEqual([
      { word: "mom", raw: "mom", comma: true },
      { word: "dad", raw: "dad" },
    ])
    expect(normalize("mom , dad").tokens).toEqual([
      { word: "mom", raw: "mom", comma: true },
      { word: "dad", raw: "dad" },
    ])
    // A number's own commas are not one.
    expect(normalize("$1,250.75").tokens).toEqual([
      { word: "$1,250.75", raw: "$1,250.75" },
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

  it("hands readAmountPhrase a range or a sign as typed, so it is a question, never one number", () => {
    const read = jest.spyOn(amountPhrase, "readAmountPhrase")
    const question = (reason: string) => ({ kind: "clarifyAmount", reason })

    expect(matchGrammar("send bob 5-10", JMD)).toEqual(question("mixed"))
    expect(read).toHaveBeenLastCalledWith("5-10", JMD)
    expect(matchGrammar("send 20-25 to bob", JMD)).toEqual(question("mixed"))
    expect(read).toHaveBeenLastCalledWith("20-25", JMD)
    expect(matchGrammar("send 1-2 bitcoin to bob", USD)).toEqual(question("mixed"))
    expect(read).toHaveBeenLastCalledWith("1-2 bitcoin", USD)
    expect(matchGrammar("request 20-25", JMD)).toEqual(question("mixed"))
    expect(read).toHaveBeenLastCalledWith("20-25", JMD)
    expect(matchGrammar("send -5 to bob", JMD)).toEqual(question("unit"))
    expect(read).toHaveBeenLastCalledWith("-5", JMD)
  })

  it("never takes what a payment is for as the payee", () => {
    // It names no one: resolveContact could only ask about Brent for "rent",
    // Billy for "bill" or Vargas for "gas".
    ;[
      "sen 500 fi di rent",
      "sen 500 fi rent",
      "pay my bill 500",
      "pay bill 500",
      "sen 500 fi bill",
      "send 500 to the bill",
      "pay di light bill 3000",
      "send 1000 to the school fees",
      "pay rent 20000",
      "sen 2000 fi gas",
      "sen 1000 fi mi books",
      "sen 1500 fi di market",
      "gi 3000 fi petrol",
      "pay di uniform 4000",
    ].forEach((utterance) =>
      expect([utterance, matchGrammar(utterance, JMD)]).toEqual([utterance, undefined]),
    )
    // A memo can say what it is for.
    expect(matchGrammar("send $5 to bob for rent", USD)).toEqual({
      kind: "call",
      call: {
        intent: "prepareSend",
        args: { payee: "bob", amount: "5", currency: "USD", memo: "rent" },
      },
    })
    // "bill" is a name too: after a typed "to", it names a contact called Bill.
    expect(matchGrammar("send $5 to bill", USD)).toEqual({
      kind: "call",
      call: {
        intent: "prepareSend",
        args: { payee: "bill", amount: "5", currency: "USD" },
      },
    })
  })

  it("finds a purpose word in each part of a hyphenated word", () => {
    // "light-bill" folds to "lightbill", a word on no list; its parts are not.
    ;[
      "pay di light-bill 3000",
      "pay light-bill 3000",
      "send 2000 to the phone-bill",
      "sen 800 fi taxi-fare",
      "send 500 to my school-fees",
    ].forEach((utterance) =>
      expect([utterance, matchGrammar(utterance, JMD)]).toEqual([utterance, undefined]),
    )
    // A hyphenated name holds no purpose word, and "bill" in one is a name
    // after a typed "to", as on its own.
    expect(matchGrammar("send 500 to Kerry-Ann", JMD)).toEqual({
      kind: "call",
      call: { intent: "prepareSend", args: { payee: "kerry-ann", amount: "500" } },
    })
    expect(matchGrammar("send $5 to Bill-Jones", USD)).toEqual({
      kind: "call",
      call: {
        intent: "prepareSend",
        args: { payee: "bill-jones", amount: "5", currency: "USD" },
      },
    })
  })

  it("passes a word on no list to resolveContact, which asks unless it is a contact's own name", () => {
    // No list holds every word for what a payment is for, or every role a
    // contact may be saved under, so the grammar passes the word on: "the
    // barber" may be a contact called Barber, and resolveContact never
    // answers Barbara for it (read/resolve-contact.spec.ts).
    expect(matchGrammar("sen 2000 fi di barber", JMD)).toEqual({
      kind: "call",
      call: { intent: "prepareSend", args: { payee: "barber", amount: "2000" } },
    })
  })

  it("never makes two payees joined by &, + or a comma into one", () => {
    ;[
      "send 20 to mom & dad",
      "send 20 to mom + dad",
      "send 20 to mom, dad",
      "send 20 to mom , dad",
      "send mom, dad 20",
      "payments to mom, dad",
    ].forEach((utterance) =>
      expect([utterance, matchGrammar(utterance, USD)]).toEqual([utterance, undefined]),
    )
    // A comma after the one payee ends the sentence.
    expect(matchGrammar("send $5 to bob, please", USD)).toEqual({
      kind: "call",
      call: {
        intent: "prepareSend",
        args: { payee: "bob", amount: "5", currency: "USD" },
      },
    })
  })

  it("takes a name with a hyphen or an apostrophe inside it, as typed", () => {
    const sendTo = (payee: string, amount: string) => ({
      kind: "call",
      call: { intent: "prepareSend", args: { payee, amount } },
    })
    expect(matchGrammar("sen 500 to Kerry-Ann", JMD)).toEqual(sendTo("kerry-ann", "500"))
    expect(matchGrammar("gi Sherry-Ann 1000", JMD)).toEqual(sendTo("sherry-ann", "1000"))
    expect(matchGrammar("send 500 to D'Andre", JMD)).toEqual(sendTo("d'andre", "500"))
    // As a phone's keyboard types the apostrophe.
    expect(matchGrammar("send 500 to D’Andre", JMD)).toEqual(sendTo("d’andre", "500"))
    expect(matchGrammar("payments to Kerry-Ann", JMD)).toEqual({
      kind: "call",
      call: {
        intent: "getTransactions",
        args: { direction: "SEND", query: "kerry-ann" },
      },
    })
    // Not at either end.
    expect(matchGrammar("send 500 to -bob", JMD)).toBeUndefined()
  })

  it("reads the account's own currency code beside a number as its money", () => {
    const TTD = { displayCurrency: "TTD", displaySymbol: "TT$" }
    expect(matchGrammar("send 100 ttd to bob", TTD)).toEqual({
      kind: "call",
      call: { intent: "prepareSend", args: { payee: "bob", amount: "100" } },
    })
    expect(matchGrammar("request 100 TTD", TTD)).toEqual({
      kind: "call",
      call: { intent: "prepareReceive", args: { amount: "100" } },
    })
    // On any other account it names no unit the grammar reads.
    expect(matchGrammar("send 100 ttd to bob", USD)).toBeUndefined()
  })

  it("gives, in its amount question, an example the grammar reads on that account", () => {
    // Assistant.amountUnclear names the account's display currency code; a
    // user who types the example back gets a call, not the question again.
    const en = i18nObject("en")
    ;[USD, JMD, { displayCurrency: "TTD", displaySymbol: "TT$" }].forEach((account) => {
      const reply = en.Assistant.amountUnclear({ currency: account.displayCurrency })
      const example = /like (.+)\.$/.exec(reply)?.[1]
      expect(example).toBeDefined()
      expect(matchGrammar(`send ${example} to bob`, account)).toEqual({
        kind: "call",
        call: expect.objectContaining({
          intent: "prepareSend",
          args: expect.objectContaining({ payee: "bob", amount: "100" }),
        }),
      })
    })
    // The example it gave before, "500 JMD", is a question on a USD account.
    expect(matchGrammar("send 500 JMD to bob", USD)).toEqual({
      kind: "clarifyAmount",
      reason: "unit",
    })
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

describe("readGrammar (ENG-690)", () => {
  it("keeps what v1 refuses apart from what no rule reads, so no later tier reads past a refusal", () => {
    const refused = [
      // A rule's refusal: a pronoun, a follow-up, a time, two payees, what
      // a payment is for.
      "send her $5",
      "send bob another $5",
      "send bob $5 next week",
      "send $10 to bob and $5 to alice",
      "sen 800 fi di book",
      // Before any rule: an invoice or an address, and a question about the app.
      "send $5 to alice@flashapp.me",
      "how do I send money",
    ]
    refused.forEach((utterance) => {
      expect(readGrammar(utterance, USD)).toEqual({ kind: "refused" })
      // matchGrammar answers both the same way.
      expect(matchGrammar(utterance, USD)).toBeUndefined()
    })
    // Words no rule reads are a miss, not a refusal.
    expect(readGrammar("hook bob up with 5 dollars", USD)).toBeUndefined()
    expect(readGrammar("tell me a joke", USD)).toBeUndefined()
    expect(readGrammar("   ", USD)).toBeUndefined()
  })

  it("refuses a question by its opener: these fifteen, and no other", () => {
    // isQuestionAboutHow (words.ts), once the frame is stripped. The spec's
    // ENG-690 entry names this set, and the owner decides whether questions
    // stay inside the boundary: a change here is a change there.
    const questions: [string, typeof USD][] = [
      ["how do I send money", USD],
      ["how can I get paid", USD],
      ["how does lightning work", USD],
      ["how to receive bitcoin", USD],
      ["how should I save", USD],
      ["how mi fi sen money", JMD],
      ["why is bitcoin down", USD],
      ["where can I spend bitcoin", USD],
      ["when did kemar last pay me", USD],
      ["is bitcoin going up", USD],
      ["are fees high today", USD],
      ["should I buy bitcoin", USD],
      ["will bitcoin go up", USD],
      ["does flash charge fees", USD],
      ["do I have enough to send bob 20", USD],
    ]
    expect(questions).toHaveLength(15)
    questions.forEach(([utterance, account]) =>
      expect([utterance, readGrammar(utterance, account)]).toEqual([
        utterance,
        { kind: "refused" },
      ]),
    )
    // A question with any other opener is a plain miss: the model may read it.
    expect(readGrammar("what is lightning", USD)).toBeUndefined()
  })

  it("refuses a send it cannot read as one contact and at most one amount", () => {
    // The send rule's refusals beyond the pronoun, follow-up, time, two
    // payments and purpose above: no payee, a wallet it does not know after
    // "from", payee words on both sides of the amount or before its "to",
    // and words no one name holds (more than four of them).
    const sends = [
      "send 5 dollars",
      "send bob $5 from my savings",
      "send bob $5 alice",
      "send bob 5 to alice",
      "send 5 to bob jones smith brown junior",
    ]
    sends.forEach((utterance) =>
      expect([utterance, readGrammar(utterance, USD)]).toEqual([
        utterance,
        { kind: "refused" },
      ]),
    )
  })

  it("answers a match as matchGrammar does", () => {
    expect(readGrammar("my balance", USD)).toEqual(matchGrammar("my balance", USD))
    expect(readGrammar("send bob 5k", JMD)).toEqual(matchGrammar("send bob 5k", JMD))
    const refuses: GrammarRule = {
      name: "test.refuses",
      intent: "prepareSend",
      match: () => ({ kind: "refuse" }),
    }
    expect(readGrammar("my balance", USD, [refuses, ...GRAMMAR_RULES])).toEqual({
      kind: "refused",
    })
  })
})
