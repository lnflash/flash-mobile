import * as amountPhrase from "@app/assistant/engine/amount-phrase"
import { routeIntent } from "@app/assistant/engine/intent-router"
import { GRAMMAR_RULES, matchGrammar, readGrammar } from "@app/assistant/grammar"
import { directionsSaid, isHistoryWord } from "@app/assistant/grammar/get-transactions"
import { normalize, textOf, WORD_FOLDS } from "@app/assistant/grammar/normalize"
import type { GrammarRule } from "@app/assistant/grammar/types"
import {
  frameWordsOf,
  GROUP_WORDS,
  namesDate,
  namesTwoPeople,
  neverNames,
  stripFrame,
} from "@app/assistant/grammar/words"
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

  it("reads an amount in cents or in words up to ninety-nine, as readAmountPhrase does (ENG-731)", () => {
    const sendTo = (payee: string, amount: string, currency?: "USD") => ({
      kind: "call",
      call: {
        intent: "prepareSend",
        args: { payee, amount, ...(currency ? { currency } : {}) },
      },
    })
    const question = (reason: string) => ({ kind: "clarifyAmount", reason })

    // The owner's dogfood: cents are the display currency's, so the call
    // carries no currency, on a USD account and a J$ one alike.
    expect(matchGrammar("Send 5 cent to dreadmax", USD)).toEqual(
      sendTo("dreadmax", "0.05"),
    )
    expect(matchGrammar("Send 5 cent to dreadmax", JMD)).toEqual(
      sendTo("dreadmax", "0.05"),
    )
    expect(matchGrammar("send five dollars to mom", USD)).toEqual(
      sendTo("mom", "5", "USD"),
    )
    // "dollars" on a J$ account is a question, in words as in digits.
    expect(matchGrammar("send five dollars to mom", JMD)).toEqual(question("unit"))
    // Patois as the corpus writes it: "fi" is "to", never five, and
    // "dolla" is "dollar"; past ninety-nine is a question.
    expect(matchGrammar("sen fifty cent fi tanya", JMD)).toEqual(sendTo("tanya", "0.50"))
    expect(matchGrammar("sen bob ten dolla", JMD)).toEqual(question("unit"))
    expect(matchGrammar("sen five hundred to bob", JMD)).toEqual(question("suffix"))
    // A number in words with a hyphen, and "c" right after a number.
    expect(matchGrammar("send ninety-nine cents to tanya", USD)).toEqual(
      sendTo("tanya", "0.99"),
    )
    expect(matchGrammar("send 5 c to bob", USD)).toEqual(sendTo("bob", "0.05"))
    expect(matchGrammar("send bob 50c", JMD)).toEqual(sendTo("bob", "0.50"))
    // That "c" ends the amount: the last word, or before "to" ("fi"),
    // "for" or "from".
    expect(matchGrammar("send bob 5 c", USD)).toEqual(sendTo("bob", "0.05"))
    expect(matchGrammar("send 5 c fi bob", JMD)).toEqual(sendTo("bob", "0.05"))
    expect(matchGrammar("send 20 c to bob for lunch", JMD)).toEqual({
      kind: "call",
      call: {
        intent: "prepareSend",
        args: { payee: "bob", amount: "0.20", memo: "lunch" },
      },
    })
    expect(matchGrammar("request 50 c for my bitcoin wallet", JMD)).toEqual({
      kind: "call",
      call: { intent: "prepareReceive", args: { amount: "0.50", wallet: "BTC" } },
    })
    // Before "and", it ends one of two amounts: a question, as "$5 and $10" is.
    expect(matchGrammar("send 5 c and 10 c to bob", USD)).toEqual(question("mixed"))
    // "c" anywhere else is a word: here, the payee's initial, after "to" or
    // before the number.
    expect(matchGrammar("send 5 to c", USD)).toEqual(sendTo("c", "5"))
    expect(matchGrammar("pay c 5", USD)).toEqual(sendTo("c", "5"))
    // A "c" right after the number that a name follows is the name's
    // initial too: J$500 to C Brown, never J$5.00 to Brown, whom
    // resolveContact would take as one whole word of "C Brown".
    expect(matchGrammar("send 500 c brown", JMD)).toEqual(sendTo("c brown", "500"))
    expect(matchGrammar("send 2000 c. brown", JMD)).toEqual(sendTo("c brown", "2000"))
    // A request reads them the same.
    expect(matchGrammar("request two dollars", USD)).toEqual({
      kind: "call",
      call: { intent: "prepareReceive", args: { amount: "2", currency: "USD" } },
    })
  })

  it("hands readAmountPhrase the words for a number and for cents with the amount", () => {
    const read = jest.spyOn(amountPhrase, "readAmountPhrase")

    matchGrammar("send five cents to bob", USD)
    expect(read).toHaveBeenLastCalledWith("five cents", USD)
    matchGrammar("pay alice twenty five cents", USD)
    expect(read).toHaveBeenLastCalledWith("twenty five cents", USD)
    // normalize.ts drops the hyphen of a word with no digit.
    matchGrammar("send ninety-nine cents to tanya", USD)
    expect(read).toHaveBeenLastCalledWith("ninetynine cents", USD)
    matchGrammar("send 5 c to bob", USD)
    expect(read).toHaveBeenLastCalledWith("5 c", USD)
    // A name after the "c" keeps it out of the amount.
    matchGrammar("send 500 c brown", JMD)
    expect(read).toHaveBeenLastCalledWith("500", JMD)
  })

  it("never reads an article before a currency's name, or a count of requests, as an amount", () => {
    // Each asks for an address or an invoice, not for one bitcoin or one
    // dollar. Jamaican English's article is "one", and a number in words
    // that counts the requests ("two invoices") gives no amount either.
    ;[
      "give me a bitcoin address",
      "make a bitcoin invoice",
      "make a usd invoice",
      "give me one bitcoin address",
      "gi mi one bitcoin address",
      "make one invoice",
      "make one usd invoice",
      "make one jmd invoice",
      "give me two invoices",
      // Words that say which request may sit between the count and its name.
      "make one lightning invoice",
      "give me one new bitcoin address",
      "make one cash invoice",
      "make one payment request",
      "give me one qr code",
      "make two bitcoin invoices",
      // So may the wallet or account it is for, and "payment" names a
      // request as "invoice" does.
      "gi mi one bitcoin wallet address",
      "give me one btc wallet address",
      "give me one bitcoin account address",
      "make one bitcoin wallet invoice",
      "receive one payment",
      "mi waan receive one payment",
      "request one payment",
      "receive one bitcoin payment",
      "receive one usd payment",
      // "payment" before another name says which request is counted.
      "make two usd payment invoices",
      "give me two bitcoin payment invoices",
    ].forEach((utterance) => {
      ;[USD, JMD].forEach((ctx) => {
        const match = matchGrammar(utterance, ctx)
        const amount = match?.kind === "call" ? match.call.args?.amount : undefined
        expect([utterance, ctx.displayCurrency, amount]).toEqual([
          utterance,
          ctx.displayCurrency,
          undefined,
        ])
      })
    })
  })

  it("never answers a counted request for the bitcoin wallet, or one that names it outside the amount, with another wallet's", () => {
    // A currency's name read into the amount is a word the wallet check never
    // sees: "gi mi one bitcoin wallet address" was the cash wallet's address
    // with a 1 BTC amount line. Each of these asks about the amount, or is a
    // request with `wallet: "BTC"`.
    ;[
      "gi mi one bitcoin wallet address",
      "give me one btc wallet address",
      "give me one bitcoin account address",
      "make one bitcoin wallet invoice",
      "bitcoin wallet address",
      "receive to my btc wallet",
      "request 50 c for my bitcoin wallet",
    ].forEach((utterance) => {
      ;[USD, JMD].forEach((ctx) => {
        const match = matchGrammar(utterance, ctx)
        const elsewhere = match?.kind === "call" && match.call.args?.wallet !== "BTC"
        expect([utterance, ctx.displayCurrency, elsewhere]).toEqual([
          utterance,
          ctx.displayCurrency,
          false,
        ])
      })
    })
  })

  it("reads a request's amount in words when it has a unit, or no request is named after it", () => {
    const receive = (args: Record<string, string>) => ({
      kind: "call",
      call: { intent: "prepareReceive", args },
    })

    expect(matchGrammar("make a twenty dollar invoice", USD)).toEqual(
      receive({ amount: "20", currency: "USD" }),
    )
    expect(matchGrammar("make a five usd invoice", JMD)).toEqual(
      receive({ amount: "5", currency: "USD" }),
    )
    expect(matchGrammar("receive five dollars", USD)).toEqual(
      receive({ amount: "5", currency: "USD" }),
    )
    expect(matchGrammar("request one bitcoin", USD)).toEqual(
      receive({ amount: "1", currency: "BTC" }),
    )
    expect(matchGrammar("make an invoice for five", JMD)).toEqual(
      receive({ amount: "5" }),
    )
    // "payment" names a request as "invoice" does, so a unit keeps the amount.
    expect(matchGrammar("receive a five usd payment", JMD)).toEqual(
      receive({ amount: "5", currency: "USD" }),
    )
    // Digits are never an article.
    expect(matchGrammar("make a 500 invoice", JMD)).toEqual(receive({ amount: "500" }))
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
    // A question with any other opener is a plain miss: the model may read
    // it. "What is" and "what are" are refused too, but only after the
    // rules (the next case).
    expect(readGrammar("who is satoshi", USD)).toBeUndefined()
    expect(readGrammar("what can you do", USD)).toBeUndefined()
    expect(readGrammar("what time is it", USD)).toBeUndefined()
  })

  it('refuses a question about what something is once no rule reads it: "what is", "what\'s", "whats", "what are" (ENG-749)', () => {
    const questions: [string, typeof USD][] = [
      ["what is lightning", USD],
      ["what's a sat", USD],
      ["What’s lightning?", USD],
      ["whats an invoice", USD],
      ["what are fees", USD],
      ["what is bitcoin", USD],
      // Its frame goes first, as for the other openers.
      ["hey, what is lightning", USD],
      ["can you tell me what's an onchain address", USD],
      // Patois "wah" is "what" (folds.ts).
      ["wah is lightning", JMD],
    ]
    questions.forEach(([utterance, account]) => {
      expect([utterance, readGrammar(utterance, account)]).toEqual([
        utterance,
        { kind: "refused" },
      ])
      expect(matchGrammar(utterance, account)).toBeUndefined()
    })
    // A read a rule takes stays a read: the question is asked only after
    // the rules, so the gate's hits are untouched.
    const reads: [string, typeof USD, unknown][] = [
      ["what is my balance", USD, { intent: "getBalances", args: {} }],
      ["What's my balance today?", USD, { intent: "getBalances", args: {} }],
      ["whats in my account", USD, { intent: "getBalances", args: {} }],
      ["what are my balances", JMD, { intent: "getBalances", args: {} }],
      ["what is the bitcoin price", JMD, { intent: "getPrice", args: {} }],
      ["what's btc worth", JMD, { intent: "getPrice", args: {} }],
    ]
    reads.forEach(([utterance, account, call]) =>
      expect([utterance, readGrammar(utterance, account)]).toEqual([
        utterance,
        { kind: "call", call },
      ]),
    )
    // "What" before any other word is no such question.
    expect(readGrammar("what did bob say", USD)).toBeUndefined()
    expect(readGrammar("what", USD)).toBeUndefined()
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

  it('reads two amounts as one ask only with nothing but "and", "or" or "plus" between them', () => {
    // CONNECTORS (words.ts), the set the spec's ENG-690 entry names: two
    // amounts so joined are a question about the amount, never a refusal.
    // Any other word between them refuses the ask. Neither reaches the model.
    const joined = ["send bob $5 and $3", "send bob $5 or $3", "send bob $5 plus $3"]
    joined.forEach((utterance) =>
      expect([utterance, readGrammar(utterance, USD)]).toEqual([
        utterance,
        { kind: "clarifyAmount", reason: "mixed" },
      ]),
    )
    const apart = ["send bob $5 minus $3", "send bob $5 and then $3"]
    apart.forEach((utterance) =>
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

describe("the words the on-device model's calls are held to (ENG-751)", () => {
  const tokensOf = (utterance: string) => stripFrame(normalize(utterance).tokens)

  it("names a date by its words, numbers, months and stretches, never by a count", () => {
    const dated = [
      "what did i get yesterday",
      "payments this month",
      "transactions from last week",
      "what came in today",
      "payments since june",
      "payments in september",
      "show the past year",
      "what did i send 3 days ago",
      "payments on 10/15",
      "payments on 2026-10-15",
      "payments since the 15th",
      "what did i get may 5",
      "payments from 5 oct",
      "transactions in 2025",
      "payments between june and july",
      "payments between the 1st and the 9th",
      // A span of years, which no other word marks, and a span of amounts,
      // which no read filters by either: "between" with a number right
      // after it, a currency sign before it included.
      "payments between 2024 and 2025",
      "payments between 500 and 1000",
      "payments between $50 and $100",
      "payments between j$500 and j$1000",
      "payments on monday",
      "what i spent last night",
      "wah mi get tideh",
      "wah mi sen yessideh",
      "how much mi spen dis mont",
    ]
    const undated = [
      "my last 5 payments",
      "my last payment",
      "show every payment to bob",
      "may i see my payments",
      "payments from jan",
      "who sent me money recently",
      "latest transactions",
      "payments of 2000",
      "send bob $5",
      // "between" two people is a read filtered by a contact, not a date,
      // wherever a count stands.
      "transactions between me and kemar",
      "transactions between me and kemar, last 5",
      "my 5 latest payments between me and kemar",
    ]

    expect(dated.filter((utterance) => !namesDate(normalize(utterance).tokens))).toEqual(
      [],
    )
    expect(undated.filter((utterance) => namesDate(normalize(utterance).tokens))).toEqual(
      [],
    )
  })

  it("names two people joined as one ask, and never an amount or a frame's word as one", () => {
    const two = [
      "tanya and kemar need 20",
      "tanya & kemar need 20",
      "bob + alice get 5",
      "bob or alice can have 40",
      "tanya an kemar fi get 500",
      "mi an jason need 1000",
      "me and bob need 20",
      "hook up bob, tanya with 15",
      "tanya and my sister need 25",
      "give it to him and her",
    ]
    const one = [
      "send bob $5 and $3",
      "bob gets 5 and 10",
      "send $5 to bob, please",
      "hook bob up with 5 dollars",
      "send tanya $12 for kemar's lunch",
      "pay bob 50 for rent and lights",
      "throw bob 5 and thanks",
      "make an invoice",
    ]

    expect(two.filter((utterance) => !namesTwoPeople(tokensOf(utterance), USD))).toEqual(
      [],
    )
    expect(one.filter((utterance) => namesTwoPeople(tokensOf(utterance), USD))).toEqual(
      [],
    )
  })

  it("holds the group words of a split, a share and a plural, not a single send's", () => {
    ;["split", "between", "each", "both", "everyone", "everybody", "half", "halves"]
      .concat(["us", "them", "people"])
      .forEach((word) => expect([word, GROUP_WORDS.has(word)]).toEqual([word, true]))
    ;["and", "with", "all", "to", "for"].forEach((word) =>
      expect([word, GROUP_WORDS.has(word)]).toEqual([word, false]),
    )
    // Patois "dem" reaches the rules as "them".
    expect(normalize("dem").tokens[0].word).toBe("them")
    // The words for more than one payee are the grammar's own, one list for
    // both: never a payee's name to the grammar, always a group's send here.
    ;["between", "split", "each", "everyone", "everybody", "people"].forEach((word) =>
      expect([word, GROUP_WORDS.has(word), neverNames(word)]).toEqual([word, true, true]),
    )
  })

  it("gives the directions a history ask's words name, both when they are unsure", () => {
    const said = (utterance: string) =>
      [...directionsSaid(normalize(utterance).tokens)].sort()

    expect(said("what did i send")).toEqual(["SEND"])
    expect(said("what have i spent")).toEqual(["SEND"])
    expect(said("who did i pay")).toEqual(["SEND"])
    expect(said("outgoing payments")).toEqual(["SEND"])
    expect(said("payments to kemar")).toEqual(["SEND"])
    expect(said("what did i receive")).toEqual(["RECEIVE"])
    expect(said("payments from alice")).toEqual(["RECEIVE"])
    expect(said("what came in")).toEqual(["RECEIVE"])
    expect(said("what did i earn")).toEqual(["RECEIVE"])
    expect(said("money sent to me")).toEqual(["RECEIVE", "SEND"])
    expect(said("who sent me money")).toEqual(["RECEIVE", "SEND"])
    expect(said("who pay mi")).toEqual(["RECEIVE", "SEND"])
    expect(said("payments fi mi madda")).toEqual(["RECEIVE", "SEND"])
    expect(said("what did i send my mom")).toEqual(["SEND"])
    // The nouns for what came in and what went out.
    expect(said("show my earnings")).toEqual(["RECEIVE"])
    expect(said("show my income")).toEqual(["RECEIVE"])
    expect(said("show my expenses")).toEqual(["SEND"])
    expect(said("show my purchases")).toEqual(["SEND"])
    // The grammar's own send verbs (SEND_VERBS) and their other forms.
    expect(said("who did i tip")).toEqual(["SEND"])
    expect(said("what did i transfer")).toEqual(["SEND"])
    expect(said("who did i transfer to")).toEqual(["SEND"])
    expect(said("money i transferred")).toEqual(["SEND"])
    expect(said("who did i give money")).toEqual(["SEND"])
    // The grammar's own receive verbs (RECEIVE_VERBS) and their other forms.
    expect(said("what did i collect")).toEqual(["RECEIVE"])
    expect(said("money i collected")).toEqual(["RECEIVE"])
    // A refund goes either way: one the user got, or one they gave.
    expect(said("show my refunds")).toEqual(["RECEIVE", "SEND"])
    expect(said("my last refund")).toEqual(["RECEIVE", "SEND"])
    expect(said("who did i refund")).toEqual(["RECEIVE", "SEND"])
    expect(said("show my transactions")).toEqual([])
    expect(said("recent payments")).toEqual([])
  })

  it("tells the words a history ask is made of from what it looks for", () => {
    const own = [
      "payments",
      "transactions",
      "history",
      "received",
      "sent",
      "paid",
      "money",
    ]
    own
      .concat(["recent", "biggest", "first", "five"])
      // A comparison with an amount ("over $50", "less than 2000").
      .concat(["over", "above", "under", "below", "than", "less", "bigger"])
      // The nouns for what came in and what went out.
      .concat(["earnings", "income", "refunds", "expenses", "purchases"])
      // The grammar's send and receive verbs, and their other forms.
      .concat(["tip", "tipped", "transfer", "transferred", "collect", "requested"])
      .forEach((word) => expect([word, isHistoryWord(word)]).toEqual([word, true]))
    ;["kemar", "rent", "lunch", "madda", "dreadmax", "invoice"].forEach((word) =>
      expect([word, isHistoryWord(word)]).toEqual([word, false]),
    )
  })

  it("gives the words of an ask's own frame, and never a word of the ask itself", () => {
    const frameOf = (utterance: string) =>
      [...frameWordsOf(normalize(utterance).tokens)].sort()

    expect(frameOf("show my earnings")).toEqual(["my", "show"])
    expect(frameOf("can you list my payments please")).toEqual([
      "can",
      "list",
      "please",
      "you",
    ])
    expect(frameOf("what did i pay for the check")).toEqual([])
    expect(frameOf("my payments")).toEqual([])
    // A word the ask itself holds is the ask's, though the frame holds it
    // too: the memo's "check", the name "will".
    expect(frameOf("check what i paid for the check")).toEqual([])
    expect(frameOf("will you show me what i got from will")).toEqual([
      "me",
      "show",
      "you",
    ])
  })
})
