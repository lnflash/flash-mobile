import type { ContactRow } from "@app/assistant/rails/graphql-rail"
import {
  CONTACT_CANDIDATE_THRESHOLD,
  CONTACT_MATCH_THRESHOLD,
  resolveContact,
} from "@app/assistant/registry/read/resolve-contact"
import { fakeCtx } from "../fakes"
import { TUNING } from "./corpus/tuning"

// The contact-confidence threshold against the phrasing corpus (docs/ai-
// assistant-tool-registry.md §4, §9): every payee the tuning corpus names,
// through resolveContact over an address book holding them all, at the two
// thresholds resolve-contact.ts sets. A payee is answered only when it names
// the contact meant; anything less sure is a question that offers that
// contact. The counts go to the log for the PR. A change to either threshold
// changes read/resolve-contact.spec.ts in the same PR.

const contact = (username: string, alias: string | null = null): ContactRow =>
  ({
    __typename: "UserContact",
    id: username,
    username,
    alias,
    transactionsCount: 1,
  } as ContactRow)

/** An address book: two Alices, three Bobs, family by what the user calls them. */
const BOOK = [
  contact("alice_w", "Alice"),
  contact("alicesmith", "Alice Smith"),
  contact("kemar"),
  contact("tanya876", "Tanya"),
  contact("mommy_g", "Mom"),
  contact("dad_jm", "Dad"),
  contact("jason"),
  contact("bob"),
  contact("bob123"),
  contact("bob_jones", "Bob Jones"),
  contact("unclejoe", "Uncle Joe"),
  contact("sis_k", "Sister"),
  contact("landlord_k", "Landlord"),
  contact("bredda_t", "Bredda"),
  contact("sista_m", "Sista"),
]

/** The contact each payee in the corpus means. */
const MEANT: Readonly<Record<string, string>> = {
  "alice": "alice_w",
  "alice smith": "alicesmith",
  "kemar": "kemar",
  "tanya": "tanya876",
  "mom": "mommy_g",
  "dad": "dad_jm",
  "jason": "jason",
  "bob": "bob",
  "bob123": "bob123",
  "bob_jones": "bob_jones",
  "uncle joe": "unclejoe",
  "sister": "sis_k",
  "landlord": "landlord_k",
  "bredda": "bredda_t",
  "sista": "sista_m",
}

/** Every payee the tuning corpus's sends name, once each. */
const PAYEES = [
  ...new Set(
    TUNING.flatMap(({ expected }) =>
      typeof expected !== "string" && expected.intent === "prepareSend"
        ? [String(expected.args?.payee)]
        : [],
    ),
  ),
].sort()

type Resolution =
  | { kind: "match"; username: string }
  | { kind: "picker"; usernames: string[] }
  | { kind: "none" }

const resolvePayee = async (hint: string): Promise<Resolution> => {
  const { ctx, graphql } = fakeCtx()
  graphql.contacts.mockResolvedValue(BOOK)
  graphql.accountDefaultWallet.mockImplementation(async (username: string) => ({
    __typename: "PublicWallet",
    id: `${username}-wallet`,
    walletCurrency: "USD",
  }))
  const result = await resolveContact.run({ hint }, ctx)
  if (result.kind === "answer") {
    return { kind: "match", username: (result.payload as { username: string }).username }
  }
  if (result.kind === "clarification" && result.card.options.length > 0) {
    return { kind: "picker", usernames: result.card.options.map(({ id }) => id) }
  }
  return { kind: "none" }
}

describe("the contact threshold over the tuning corpus's payees", () => {
  it("is checked at the thresholds resolve-contact.ts sets", () => {
    // The counts below were taken at these values; a change to either one
    // changes read/resolve-contact.spec.ts and this spec in the same PR.
    expect(CONTACT_MATCH_THRESHOLD).toBe(0.8)
    expect(CONTACT_CANDIDATE_THRESHOLD).toBe(0.6)
  })

  it("knows which contact every payee in the corpus means", () => {
    expect(PAYEES.length).toBeGreaterThan(10)
    expect(PAYEES.filter((payee) => MEANT[payee] === undefined)).toEqual([])
  })

  it("answers only the contact meant, and otherwise asks with it among the options", async () => {
    const resolutions = await Promise.all(
      PAYEES.map(async (payee) => ({ payee, resolution: await resolvePayee(payee) })),
    )
    const count = (kind: Resolution["kind"]) =>
      resolutions.filter(({ resolution }) => resolution.kind === kind).length
    console.log(
      `contact threshold ${CONTACT_MATCH_THRESHOLD} (candidates from ` +
        `${CONTACT_CANDIDATE_THRESHOLD}), ${PAYEES.length} corpus payees over ` +
        `${BOOK.length} contacts: ${count("match")} answered, ${count(
          "picker",
        )} asked, ` +
        `${count("none")} not found\n` +
        resolutions
          .map(({ payee, resolution }) => `  ${payee}: ${JSON.stringify(resolution)}`)
          .join("\n"),
    )

    resolutions.forEach(({ payee, resolution }) => {
      const meant = MEANT[payee]
      // Never another contact, and never nobody for a contact in the book.
      if (resolution.kind === "match")
        expect([payee, resolution.username]).toEqual([payee, meant])
      else if (resolution.kind === "picker") {
        expect([payee, resolution.usernames]).toEqual([
          payee,
          expect.arrayContaining([meant]),
        ])
      } else {
        expect([payee, resolution]).toEqual([payee, { kind: "match", username: meant }])
      }
    })
  })
})
