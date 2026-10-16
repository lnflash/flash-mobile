import {
  CONTACT_MATCH_THRESHOLD,
  CONTACT_PICKER_LIMIT,
  resolveContact,
} from "@app/assistant/registry/read/resolve-contact"
import type { ContactRow } from "@app/assistant/rails/graphql-rail"
import { fakeCtx } from "../fakes"

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

const resolve = async (hint: string, contacts: ContactRow[] = CONTACTS) => {
  const { ctx, graphql } = fakeCtx()
  graphql.contacts.mockResolvedValue(contacts)
  graphql.accountDefaultWallet.mockImplementation(async (username: string) => ({
    __typename: "PublicWallet",
    id: `${username}-wallet`,
    walletCurrency: "USD",
  }))
  const result = await resolveContact.run({ hint }, ctx)
  return { result, graphql }
}

describe("resolveContact", () => {
  it("asks the user to say it another way when nothing matches", async () => {
    const { result, graphql } = await resolve("zzzz")

    expect(result).toEqual({
      kind: "clarification",
      card: { type: "clarification", prompt: "Assistant.noContactMatch", options: [] },
    })
    expect(graphql.accountDefaultWallet).not.toHaveBeenCalled()
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
    // "carl" is close to "carol" but under CONTACT_MATCH_THRESHOLD.
    const { result, graphql } = await resolve("carl")

    expect(CONTACT_MATCH_THRESHOLD).toBe(0.8)
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
