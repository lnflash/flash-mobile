import { runTool } from "@app/assistant/engine/run-tool"
import { assistantRegistry } from "@app/assistant/registry"
import {
  CONTACT_PICKER_LIMIT,
  namesContact,
  resolveContact,
} from "@app/assistant/registry/read/resolve-contact"
import { ContactRow, GraphqlRailError } from "@app/assistant/rails/graphql-rail"
import type { ToolResult } from "@app/assistant/registry/types"
import {
  accountsOf,
  failingAccountLookup,
  fakeCtx,
  recordingTelemetry,
  wallet,
} from "../fakes"

const contact = (username: string, alias: string | null = null): ContactRow =>
  ({
    __typename: "UserContact",
    id: username,
    username,
    alias,
    transactionsCount: 1,
  } as ContactRow)

const CONTACTS = [
  contact("carol", "Mom"),
  contact("bob", "Bobby"),
  contact("robert", "Rob"),
  contact("alice"),
  contact("alicia99"),
]

/** Flash users the user has not added: an account, and no contact (ENG-730). */
const NOT_CONTACTS = ["dreadmax"]

/**
 * A question with nothing to pick is a dead end (ENG-730): no hint may
 * produce one. Every hint this file resolves through `resolve` is checked.
 */
const expectSomethingToPick = (hint: string, result: ToolResult<unknown>) => {
  if (result.kind === "clarification") {
    expect([hint, result.card.options.length > 0]).toEqual([hint, true])
  }
}

const resolve = async (hint: string, contacts: ContactRow[] = CONTACTS) => {
  const { ctx, graphql } = fakeCtx()
  graphql.contacts.mockResolvedValue(contacts)
  // Each contact has an account, and so does each Flash user who is not a
  // contact; any other word is no one's username.
  graphql.accountDefaultWallet.mockImplementation(
    accountsOf([...contacts.map(({ username }) => username), ...NOT_CONTACTS]),
  )
  const result = await resolveContact.run({ hint }, ctx)
  expectSomethingToPick(hint, result)
  return { result, graphql }
}

describe("resolveContact", () => {
  it("refuses with the not-found card when the words name neither a contact nor a Flash user", async () => {
    const { result, graphql } = await resolve("zzzz")

    expect(result).toEqual({
      kind: "error",
      userMessage: "Assistant.payeeNotFound",
      card: { type: "prepareRefused", reason: "payeeNotFound" },
    })
    // Looked up as a username first, once, and no one has it.
    expect(graphql.accountDefaultWallet.mock.calls).toEqual([["zzzz"]])
  })

  it("offers a Flash user who is not a contact as a picker of one, never as an answer", async () => {
    const { result, graphql } = await resolve("dreadmax")

    expect(result).toEqual({
      kind: "clarification",
      card: {
        type: "clarification",
        // The prompt says the person is not in the contacts; the option is
        // the username alone, data and no copy.
        prompt: "Assistant.pickFlashUser",
        options: [{ id: "dreadmax", label: "dreadmax", sublabel: "dreadmax" }],
      },
    })
    expect(graphql.accountDefaultWallet.mock.calls).toEqual([["dreadmax"]])
  })

  it("looks up the username without the spaces around the words", async () => {
    const { result, graphql } = await resolve("  dreadmax ")

    expect(result).toMatchObject({
      kind: "clarification",
      card: { options: [{ id: "dreadmax", label: "dreadmax", sublabel: "dreadmax" }] },
    })
    expect(graphql.accountDefaultWallet.mock.calls).toEqual([["dreadmax"]])
  })

  it("never looks up words with a space in them as a username: no username has one", async () => {
    // A blank hint is no one's either; with no contacts, Fuse finds none for it.
    const cases: [string, ContactRow[]][] = [
      ["the guy from work", CONTACTS],
      ["dread max", CONTACTS],
      [" ", []],
    ]
    for (const [hint, contacts] of cases) {
      const { result, graphql } = await resolve(hint, contacts)

      expect([hint, result]).toEqual([
        hint,
        {
          kind: "error",
          userMessage: "Assistant.payeeNotFound",
          card: { type: "prepareRefused", reason: "payeeNotFound" },
        },
      ])
      expect(graphql.accountDefaultWallet).not.toHaveBeenCalled()
    }
  })

  it("never looks up words that cannot be a username: the server would refuse them, not find no one", async () => {
    // The server's Username pattern (lnflash/flash UsernameRegex,
    // src/domain/accounts/index.ts:74): 3 to 50 letters, digits or "_", not
    // starting with 1, 3, bc1 or lnbc1 in any case. It answers any other word
    // with an error, which the rail reads as a failed lookup (ENG-730 review).
    const notUsernames = [
      "kerry-ann",
      "d'andre",
      "mom.",
      "jo",
      "x".repeat(51),
      "1dread",
      "3dread",
      "bc1dread",
      "LNBC1dread",
      "Bc1dread",
    ]
    for (const hint of notUsernames) {
      // No contacts, so no contact looks like any of them.
      const { result, graphql } = await resolve(hint, [])

      expect([hint, result]).toEqual([
        hint,
        {
          kind: "error",
          userMessage: "Assistant.payeeNotFound",
          card: { type: "prepareRefused", reason: "payeeNotFound" },
        },
      ])
      expect([hint, graphql.accountDefaultWallet.mock.calls]).toEqual([hint, []])
    }

    // Words that can be one are looked up, whatever their letters.
    for (const hint of ["josé_1", "abc", "x".repeat(50), "DreadMax_2"]) {
      const { graphql } = await resolve(hint, [])

      expect([hint, graphql.accountDefaultWallet.mock.calls]).toEqual([hint, [[hint]]])
    }
  })

  it("fails when the username lookup fails, never calling it not found", async () => {
    // runTool answers the rejection with Assistant.toolFailed, as for every
    // other read that fails.
    const { ctx, graphql } = fakeCtx()
    graphql.contacts.mockResolvedValue(CONTACTS)
    graphql.accountDefaultWallet.mockRejectedValue(new Error("Network request failed"))

    await expect(resolveContact.run({ hint: "dreadmax" }, ctx)).rejects.toThrow(
      "Network request failed",
    )
  })

  it("fails when the server fails the lookup of an account that may exist, never refusing a real user as not found", async () => {
    // The real rail, over a server that failed dreadmax's lookup with a
    // GraphQL error on an HTTP 200 (DB_ERROR; ENG-730 review). Read as no
    // account, it was the payeeNotFound card about a real user. It is a
    // failed read, which runTool answers with Assistant.toolFailed.
    const { ctx, graphql, btcRail } = fakeCtx()
    graphql.contacts.mockResolvedValue(CONTACTS)
    graphql.accountDefaultWallet.mockImplementation(failingAccountLookup())

    await expect(resolveContact.run({ hint: "dreadmax" }, ctx)).rejects.toThrow(
      GraphqlRailError,
    )
    await expect(
      runTool(
        { intent: "resolveContact", args: { hint: "dreadmax" } },
        {
          registry: assistantRegistry,
          graphql: ctx.graphql,
          btcRail,
          displayCurrency: ctx.displayCurrency,
          lnAddressHostname: ctx.lnAddressHostname,
          now: ctx.now,
          telemetry: recordingTelemetry().telemetry,
        },
      ),
    ).resolves.toEqual({ kind: "error", userMessage: "Assistant.toolFailed" })
  })

  it("answers the user's own username with the self-payment reply, never a question whose one option is refused", async () => {
    // Signed in as dreadmax, the user names dreadmax, who is no contact: the
    // send screen refuses that at lookup time (payment-destination/
    // intraledger.ts:39-45), and the picker's one option would be refused at
    // the tap (ENG-730 review).
    const { ctx, graphql } = fakeCtx()
    graphql.contacts.mockResolvedValue(CONTACTS)
    graphql.accountDefaultWallet.mockImplementation(accountsOf(NOT_CONTACTS))
    graphql.wallets.mockResolvedValue([wallet({ id: "dreadmax-wallet" })])

    await expect(resolveContact.run({ hint: "dreadmax" }, ctx)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.selfPayment",
    })
  })

  it("asks about a contact the words look like, never offering a Flash user of those words", async () => {
    // "carl" is close to carol: her picker, even if a Flash user is called carl.
    const { ctx, graphql } = fakeCtx()
    graphql.contacts.mockResolvedValue(CONTACTS)
    graphql.accountDefaultWallet.mockImplementation(accountsOf(["carol", "carl"]))

    const result = await resolveContact.run({ hint: "carl" }, ctx)

    expect(result).toMatchObject({
      kind: "clarification",
      card: { prompt: "Assistant.pickContact", options: [{ id: "carol" }] },
    })
    expect(graphql.accountDefaultWallet).not.toHaveBeenCalled()
  })

  it("never asks a question with nothing to pick, and never says no contact matched as a question", async () => {
    const hints = [
      "zzzz",
      "dreadmax",
      "the guy from work",
      "Mom",
      "carl",
      "alice",
      "bob",
      "Rob",
    ]
    const results = await Promise.all(
      hints.map(async (hint) => ({ hint, result: (await resolve(hint)).result })),
    )

    results.forEach(({ hint, result }) => {
      expectSomethingToPick(hint, result)
      expect([hint, result.kind === "clarification" && result.card.prompt]).not.toEqual([
        hint,
        "Assistant.noContactMatch",
      ])
    })
    // Both kinds of question are among them: a contact picker and a Flash user's.
    expect(
      results.flatMap(({ result }) =>
        result.kind === "clarification" ? [result.card.prompt] : [],
      ),
    ).toEqual(
      expect.arrayContaining(["Assistant.pickContact", "Assistant.pickFlashUser"]),
    )
  })

  it("answers a single strong match with its full username and default wallet", async () => {
    const { result, graphql } = await resolve("Mom")

    expect(result).toEqual({
      kind: "answer",
      payload: {
        username: "carol",
        alias: "Mom",
        defaultWallet: { id: "carol-wallet", walletCurrency: "USD" },
      },
    })
    expect(graphql.accountDefaultWallet).toHaveBeenCalledWith("carol")
  })

  it("offers a single weak match as a picker of one, never straight through", async () => {
    // "carl" is close to "carol", but it is not her username, her alias or
    // a word of it.
    const { result, graphql } = await resolve("carl")

    expect(result).toEqual({
      kind: "clarification",
      card: {
        type: "clarification",
        prompt: "Assistant.pickContact",
        options: [{ id: "carol", label: "Mom", sublabel: "carol" }],
      },
    })
    expect(graphql.accountDefaultWallet).not.toHaveBeenCalled()
  })

  it("offers a single match the hint only looks like as a picker of one, however Fuse scores it", async () => {
    // Fuse matches anywhere in a name: "gas" in Vargas, "rent" in Brent,
    // "market" in Marketa and "wayne" in Dwayne score as high as "mom" does
    // for Mom, and "books", "andrea", "barber" and "bill jones" all score
    // above 0.8. None of them names the contact.
    const nearMisses: [string, string, string][] = [
      ["gas", "vargas_j", "Vargas"],
      ["rent", "brent_c", "Brent"],
      ["market", "marketa_l", "Marketa"],
      ["wayne", "dwayne_r", "Dwayne"],
      ["books", "brooks_t", "Brooks"],
      ["andrea", "andre_k", "Andre"],
      ["barber", "barbara_w", "Barbara"],
      ["bill jones", "bob_jones", "Bob Jones"],
    ]

    for (const [hint, username, alias] of nearMisses) {
      const { result, graphql } = await resolve(hint, [contact(username, alias)])

      expect([hint, result]).toEqual([
        hint,
        {
          kind: "clarification",
          card: {
            type: "clarification",
            prompt: "Assistant.pickContact",
            options: [{ id: username, label: alias, sublabel: username }],
          },
        },
      ])
      expect(graphql.accountDefaultWallet).not.toHaveBeenCalled()
    }
  })

  it("answers a hint that is the contact's username, alias or one word of the alias, however it is cased or punctuated", async () => {
    const answered: [string, ContactRow][] = [
      ["MOM", contact("carol", "Mom")],
      ["carol", contact("carol", "Mom")],
      ["Kerry-Ann", contact("kerryann_b", "Kerry-Ann")],
      ["kerryann", contact("kerryann_b", "Kerry-Ann")],
      ["kerry_ann", contact("kerryann_b", "Kerry-Ann")],
      ["D’Andre", contact("dandre_w", "D'Andre")],
      ["uncle joe", contact("unclejoe", "Uncle Joe")],
      ["joe", contact("unclejoe", "Uncle Joe")],
      ["Bob_Jones", contact("bob_jones")],
      ["bobjones", contact("bob_jones")],
    ]

    for (const [hint, only] of answered) {
      const { result } = await resolve(hint, [only])

      expect([hint, result.kind === "answer" && result.payload]).toEqual([
        hint,
        expect.objectContaining({ username: only.username }),
      ])
    }
  })

  it("reads a name whole: never part of a word, or a word the alias does not hold", () => {
    const uncleJoe = contact("unclejoe", "Uncle Joe")
    expect(namesContact("jo", uncleJoe)).toBe(false)
    expect(namesContact("uncle", uncleJoe)).toBe(true)
    expect(namesContact("joe smith", uncleJoe)).toBe(false)
    expect(namesContact("unclejoe", uncleJoe)).toBe(true)
    expect(namesContact("kerry", contact("kerryann_b", "Kerry-Ann"))).toBe(false)
    expect(namesContact("  ", contact("bob"))).toBe(false)
  })

  it("offers two or more matches as a picker, best first, each with its full username", async () => {
    const { result } = await resolve("alice")

    expect(result).toEqual({
      kind: "clarification",
      card: {
        type: "clarification",
        prompt: "Assistant.pickContact",
        options: [
          { id: "alice", label: "alice", sublabel: "alice" },
          { id: "alicia99", label: "alicia99", sublabel: "alicia99" },
        ],
      },
    })
  })

  it("offers two matches even when one of them is exact", async () => {
    // "bob" is exactly bob, and close to robert ("Rob"): never a guess.
    const { result } = await resolve("bob")

    expect(result.kind).toBe("clarification")
  })

  it("caps the picker at five", async () => {
    const dans = ["dan1", "dan2", "dan3", "dan4", "dan5", "dan6", "dan7"].map((name) =>
      contact(name),
    )

    const { result } = await resolve("dan", dans)

    expect(result.kind).toBe("clarification")
    if (result.kind === "clarification") {
      expect(result.card.options).toHaveLength(CONTACT_PICKER_LIMIT)
    }
  })

  it("never answers with a prepared action, whatever it finds", async () => {
    const hints = ["zzzz", "Mom", "carl", "alice", "bob", "Rob"]
    const kinds = await Promise.all(
      hints.map(async (hint) => (await resolve(hint)).result.kind),
    )

    expect(kinds).not.toContain("prepared")
  })

  it("reports no match when the contact has no account to pay", async () => {
    const { ctx, graphql } = fakeCtx()
    graphql.contacts.mockResolvedValue([contact("carol", "Mom")])
    graphql.accountDefaultWallet.mockResolvedValue(null)

    await expect(resolveContact.run({ hint: "Mom" }, ctx)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.noContactMatch",
    })
  })

  it("projects the names it was asked about, not the wallet id", async () => {
    const { result } = await resolve("Mom")
    if (result.kind !== "answer") throw new Error("expected an answer")

    expect(resolveContact.project(result.payload, { hint: "Mom" })).toEqual({
      username: "carol",
      alias: "Mom",
      walletCurrency: "USD",
    })
  })

  it("needs a hint", () => {
    expect(resolveContact.validate({}).valid).toBe(false)
    expect(resolveContact.validate({ hint: "" }).valid).toBe(false)
    expect(resolveContact.validate({ hint: "mom" }).valid).toBe(true)
  })
})
