import type { ContactRow } from "@app/assistant/rails/graphql-rail"
import {
  CONTACT_CANDIDATE_THRESHOLD,
  resolveContact,
} from "@app/assistant/registry/read/resolve-contact"
import { matchGrammar } from "@app/assistant/grammar"
import { accountsOf, fakeCtx } from "../fakes"
import { TUNING } from "./corpus/tuning"

// Contact resolution against the phrasing corpus (docs/ai-assistant-tool-
// registry.md §4, §9): every payee the tuning corpus names, through
// resolveContact over an address book, at the candidate threshold
// resolve-contact.ts sets. A payee is answered only when it is one of the
// meant contact's own names; anything else is a question that offers that
// contact. Words that name no one in the book, the corpus's and the
// review's near misses ("gas" beside Vargas, "andrea" beside Andre), are
// never answered: each is a picker offering the contact it looks like. A
// payee the book holds under no name and nothing like one is a Flash user
// the user has not added (NOT_IN_BOOK): an exact server-verified username
// reaches the payment review directly. The counts go to the log for the PR. A change
// to the threshold changes read/resolve-contact.spec.ts in the same PR.

const contact = (username: string, alias: string | null = null): ContactRow =>
  ({
    __typename: "UserContact",
    id: username,
    username,
    alias,
    transactionsCount: 1,
  } as ContactRow)

/**
 * An address book: two Alices, three Bobs, family by what the user calls
 * them, names with a hyphen or an apostrophe, as Jamaican names often have,
 * and names that hold, or nearly are, words a user types for someone or
 * something else (NEAR_MISSES).
 */
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
  contact("kerryann_b", "Kerry-Ann"),
  contact("dandre_w", "D'Andre"),
  contact("bill_m", "Bill"),
  contact("vargas_j", "Vargas"),
  contact("brent_c", "Brent"),
  contact("marketa_l", "Marketa"),
  contact("dwayne_r", "Dwayne"),
  contact("brooks_t", "Brooks"),
  contact("andre_k", "Andre"),
  contact("barbara_w", "Barbara"),
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
  "kerry-ann": "kerryann_b",
  "d'andre": "dandre_w",
  "bill": "bill_m",
}

/**
 * Words that name no one in the book, each with the contact it only looks
 * like. Fuse gives "gas", "rent", "market" and "wayne" a similarity of 1
 * to that contact, as high as "mom" to Mom, and the rest more than 0.8.
 * The purpose words never reach resolveContact from the grammar, which
 * refuses them, but a model may send them, and a purpose word the
 * grammar's list lacks reaches it the same way.
 */
const NEAR_MISSES: Readonly<Record<string, string>> = {
  "gas": "vargas_j",
  "rent": "brent_c",
  "market": "marketa_l",
  "wayne": "dwayne_r",
  "books": "brooks_t",
  "andrea": "andre_k",
  "barber": "barbara_w",
  "bill jones": "bob_jones",
}

/**
 * Payees the book holds under no name and nothing like one, each with the
 * Flash user whose username it is: someone the user has not added
 * (ENG-730). resolveContact looks the words up as a username only when no
 * contact looks like them, and offers that user as a picker of one.
 */
const NOT_IN_BOOK: Readonly<Record<string, string>> = {
  dreadmax: "dreadmax",
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

/** A contact match or picker, including exact Flash usernames. */
type Resolution =
  | { kind: "match"; username: string }
  | { kind: "picker"; usernames: string[] }
  | { kind: "none" }

const resolvePayee = async (hint: string): Promise<Resolution> => {
  const { ctx, graphql } = fakeCtx()
  graphql.contacts.mockResolvedValue(BOOK)
  // Every contact in the book has an account, and so does every Flash user
  // the book does not hold; any other word is no one's username.
  graphql.accountDefaultWallet.mockImplementation(
    accountsOf([...BOOK.map(({ username }) => username), ...Object.values(NOT_IN_BOOK)]),
  )
  const result = await resolveContact.run({ hint }, ctx)
  if (result.kind === "answer") {
    return { kind: "match", username: (result.payload as { username: string }).username }
  }
  if (result.kind === "clarification" && result.card.options.length > 0) {
    const usernames = result.card.options.map(({ id }) => id)
    return { kind: "picker", usernames }
  }
  return { kind: "none" }
}

const describeResolutions = (
  resolutions: readonly { payee: string; resolution: Resolution }[],
): string =>
  resolutions
    .map(({ payee, resolution }) => `  ${payee}: ${JSON.stringify(resolution)}`)
    .join("\n")

describe("contact resolution over the tuning corpus's payees", () => {
  it("is checked at the candidate threshold resolve-contact.ts sets", () => {
    // The counts below were taken at this value; a change to it changes
    // read/resolve-contact.spec.ts and this spec in the same PR.
    expect(CONTACT_CANDIDATE_THRESHOLD).toBe(0.6)
  })

  it("knows what every payee in the corpus means: a contact in the book, a near miss, or a Flash user the book does not hold", () => {
    expect(PAYEES.length).toBeGreaterThan(10)
    expect(
      PAYEES.filter(
        (payee) =>
          MEANT[payee] === undefined &&
          NEAR_MISSES[payee] === undefined &&
          NOT_IN_BOOK[payee] === undefined,
      ),
    ).toEqual([])
    // A near miss is in the book under another name, never its own.
    expect(Object.keys(NEAR_MISSES).filter((hint) => MEANT[hint] !== undefined)).toEqual(
      [],
    )
    // A payee not in the book is in it under no name: no contact's
    // username or alias, and no meant contact or near miss.
    expect(
      Object.keys(NOT_IN_BOOK).filter(
        (hint) =>
          MEANT[hint] !== undefined ||
          NEAR_MISSES[hint] !== undefined ||
          BOOK.some(
            ({ username, alias }) =>
              username.toLowerCase() === hint || alias?.toLowerCase() === hint,
          ),
      ),
    ).toEqual([])
  })

  it("answers only the contact meant, and otherwise asks with it among the options", async () => {
    const inBook = PAYEES.filter((payee) => MEANT[payee] !== undefined)
    const resolutions = await Promise.all(
      inBook.map(async (payee) => ({ payee, resolution: await resolvePayee(payee) })),
    )
    const count = (kind: Resolution["kind"]) =>
      resolutions.filter(({ resolution }) => resolution.kind === kind).length
    console.log(
      `contact resolution (candidates from ${CONTACT_CANDIDATE_THRESHOLD}), ` +
        `${inBook.length} corpus payees in a ${BOOK.length}-contact book: ` +
        `${count("match")} answered, ${count("picker")} asked, ` +
        `${count("none")} not found\n${describeResolutions(resolutions)}`,
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

  it("never answers a word that only looks like a contact's name: it asks, offering that contact", async () => {
    const hints = [
      ...new Set([
        ...Object.keys(NEAR_MISSES),
        ...PAYEES.filter((payee) => NEAR_MISSES[payee]),
      ]),
    ]
    const resolutions = await Promise.all(
      hints.map(async (payee) => ({ payee, resolution: await resolvePayee(payee) })),
    )
    console.log(
      `near misses, ${hints.length} words that name no one in the book:\n` +
        describeResolutions(resolutions),
    )

    resolutions.forEach(({ payee, resolution }) => {
      expect([payee, resolution]).toEqual([
        payee,
        { kind: "picker", usernames: expect.arrayContaining([NEAR_MISSES[payee]]) },
      ])
    })
  })

  it("resolves an exact Flash username outside the payment-history book", async () => {
    const notInBook = PAYEES.filter((payee) => NOT_IN_BOOK[payee] !== undefined)
    const resolutions = await Promise.all(
      notInBook.map(async (payee) => ({ payee, resolution: await resolvePayee(payee) })),
    )
    console.log(
      `not in the book, ${notInBook.length} corpus payees that are Flash users:\n` +
        describeResolutions(resolutions),
    )

    expect(notInBook.length).toBeGreaterThan(0)
    resolutions.forEach(({ payee, resolution }) => {
      expect([payee, resolution]).toEqual([
        payee,
        { kind: "match", username: NOT_IN_BOOK[payee] },
      ])
    })
    // Words that are no contact's and no Flash user's are refused: nothing
    // to pick, so no question at all.
    await expect(resolvePayee("zzzz")).resolves.toEqual({ kind: "none" })
  })

  it("pays no one the user did not name, for each ask the review found paying someone else", async () => {
    // Through the grammar, then resolveContact over the book: no call, or
    // a question offering the contact the words look like. Before, each was
    // a confirm card for that contact.
    const USD = { displayCurrency: "USD", displaySymbol: "$" }
    const JMD = { displayCurrency: "JMD", displaySymbol: "J$" }
    const asks: [string, typeof USD, "no call" | string][] = [
      ["sen 2000 fi gas", JMD, "no call"],
      ["sen 1000 fi mi books", JMD, "no call"],
      ["sen 1500 fi di market", JMD, "no call"],
      ["pay di light-bill 3000", JMD, "no call"],
      ["sen 500 fi di rent", JMD, "no call"],
      ["sen 2000 fi di barber", JMD, "barbara_w"],
      ["send 500 to andrea", JMD, "andre_k"],
      ["send 500 to wayne", JMD, "dwayne_r"],
      ["send $5 to Bill Jones", USD, "bob_jones"],
    ]

    for (const [utterance, account, lookalike] of asks) {
      const match = matchGrammar(utterance, account)
      const payee = match?.kind === "call" ? match.call.args?.payee : undefined
      const outcome = payee === undefined ? "no call" : await resolvePayee(String(payee))

      expect([utterance, outcome]).toEqual([
        utterance,
        lookalike === "no call"
          ? "no call"
          : { kind: "picker", usernames: expect.arrayContaining([lookalike]) },
      ])
    }
  })
})
