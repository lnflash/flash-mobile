import Fuse from "fuse.js"

import type { ContactRow, GraphqlRail, PublicWalletRow } from "../../rails/graphql-rail"
import { defineRead } from "../define"
import { ContactPayload, projectContact } from "../projections"
import { prepareRefusalResult } from "../refusals"
import type { ClarificationOption, ReadToolCtx, ToolResult } from "../types"

// resolveContact (docs/ai-assistant-tool-registry.md §4): turn what the user
// called someone ("mom", "bob") into one Flash contact, or ask. It never
// guesses: several matches, or one match the hint does not name exactly,
// come back as a picker, so a payee is only ever named by the user's own
// words for them or by the user's own pick. Only when no contact looks like
// the hint at all is it looked up as a Flash username (ENG-730): a Flash
// user of that name is a picker of one, whose prompt says the person is not
// in the contacts, the user's own username is the self-payment reply, and
// no one of that name is the payeeNotFound refusal card. So a question from
// here always offers at least one option, and one that can be paid. A
// lookup that fails is a failed read, never "no one of that name".
// It never prepares anything either.

/**
 * Similarity (1 minus Fuse's score, so 1 is an exact match) below which a
 * contact is not a candidate at all (Fuse threshold 0.4). Fuse's own
 * default, 0.6, offers "alice" for "carl": noise in a picker. Checked on
 * the phrasing corpus (contact-threshold.spec.ts).
 *
 * A score only gathers candidates; it never answers. Fuse matches anywhere
 * in a name, so it gives a name that merely holds the hint ("gas" in Vargas,
 * "rent" in Brent, "wayne" in Dwayne) a similarity of 1, as high as "mom"
 * for Mom: no score can tell a contact the user named from one whose name
 * looks like the words (namesContact does).
 */
export const CONTACT_CANDIDATE_THRESHOLD = 0.6

/** The most contacts a picker offers. */
export const CONTACT_PICKER_LIMIT = 5

type Args = { hint: string }

/**
 * A name as resolveContact compares it: lower case, single spaces, and no
 * "_", "-", "'" or "’", so "Kerry-Ann", "kerryann" and "kerry_ann" are one
 * name, as are "D'Andre" and "D’Andre". The model tier finds a contact's
 * name in what the person typed the same way (ENG-751).
 */
export const comparable = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[_\-'’]/g, "")
    .replace(/\s+/g, " ")
    .trim()

/**
 * Whether the hint is one of the contact's own names: its username, its
 * alias, or one whole word of the alias ("joe" for Uncle Joe). Only a
 * contact the hint names so is answered without a question; "gas" for
 * Vargas, "andrea" for Andre or "bill jones" for Bob Jones is a picker.
 * A search reads a name more loosely (getTransactions, contactsNamed): a
 * contact it takes wrongly is a row the user sees, and here a payment.
 */
export const namesContact = (hint: string, { username, alias }: ContactRow): boolean => {
  const name = comparable(hint)
  if (name === "") return false
  if (comparable(username) === name) return true
  if (!alias) return false
  const aliasName = comparable(alias)
  return aliasName === name || aliasName.split(" ").includes(name)
}

/** The contacts that look like the hint, best first. */
const findCandidates = (contacts: readonly ContactRow[], hint: string): ContactRow[] =>
  new Fuse(contacts, {
    keys: ["alias", "username"],
    ignoreLocation: true,
    threshold: 1 - CONTACT_CANDIDATE_THRESHOLD,
  })
    .search(hint.trim())
    .map(({ item }) => item)

// Every option shows the full username, whatever alias the user gave it.
const option = (contact: ContactRow): ClarificationOption => ({
  id: contact.username,
  label: contact.alias || contact.username,
  sublabel: contact.username,
})

/**
 * The words a Flash username can be: the server's Username pattern
 * (UsernameRegex, lnflash/flash src/domain/accounts/index.ts:74), 3 to 50
 * letters, digits or "_", and not starting with 1, 3, bc1 or lnbc1, in any
 * case. The server refuses any other word with an error ("Invalid value for
 * Username"), not with "no account", so a lookup of one would be a failed
 * read for a name that no one can have. @flash/client's reUsername, which
 * gates the send screen's lookups, minds the case of that start, so the
 * parser passes "LNBC1abc" as a handle that the server refuses.
 */
export const FLASH_USERNAME = /^(?!^(1|3|bc1|lnbc1))[\p{L}0-9_]{3,50}$/iu

/**
 * The default wallet of the Flash user with this username, looked up as the
 * send screen looks up a typed one (payment-destination/intraledger.ts:87-94),
 * or null when no account has it. A word that cannot be a username
 * (FLASH_USERNAME) is no one's, and costs no query: words with a space
 * ("the guy from work"), a hyphen, or none at all. A lookup the server fails
 * rejects (the rail's accountDefaultWallet), so it is never "no such user".
 */
export const flashUserWallet = async (
  username: string,
  graphql: Pick<GraphqlRail, "accountDefaultWallet">,
): Promise<PublicWalletRow | null> =>
  FLASH_USERNAME.test(username) ? graphql.accountDefaultWallet(username) : null

/**
 * No contact looks like the hint: the Flash user it names, as a picker of
 * one, or the refusal card (ENG-730). The option is data only, the username
 * as the user typed it; the prompt is the copy. A pick of it is looked up
 * again at the tap (payee.ts, fromPick), never taken from this answer. The
 * user's own username is the self-payment reply, never a question: the send
 * screen refuses a typed one at lookup time (intraledger.ts:39-45), and the
 * one option would be refused at the tap.
 */
const flashUserOrRefusal = async (
  hint: string,
  ctx: ReadToolCtx,
): Promise<ToolResult<ContactPayload>> => {
  const username = hint.trim()
  const userWallet = await flashUserWallet(username, ctx.graphql)
  if (!userWallet) return prepareRefusalResult("payeeNotFound")
  const myWallets = await ctx.graphql.wallets()
  if (myWallets.some(({ id }) => id === userWallet.id)) {
    return { kind: "error", userMessage: "Assistant.selfPayment" }
  }
  return {
    kind: "clarification",
    card: {
      type: "clarification",
      prompt: "Assistant.pickFlashUser",
      options: [{ id: username, label: username, sublabel: username }],
    },
  }
}

const run = async (
  { hint }: Args,
  ctx: ReadToolCtx,
): Promise<ToolResult<ContactPayload>> => {
  const candidates = findCandidates(await ctx.graphql.contacts(), hint)

  if (candidates.length === 0) return flashUserOrRefusal(hint, ctx)
  const [only] = candidates
  if (candidates.length > 1 || !namesContact(hint, only)) {
    // Several matches, or one the hint does not name, however close it
    // looks: the user picks, from at most CONTACT_PICKER_LIMIT, best first.
    // A picker of one is still a question (spec §4).
    return {
      kind: "clarification",
      card: {
        type: "clarification",
        prompt: "Assistant.pickContact",
        options: candidates.slice(0, CONTACT_PICKER_LIMIT).map(option),
      },
    }
  }

  const wallet = await ctx.graphql.accountDefaultWallet(only.username)
  if (!wallet) return { kind: "error", userMessage: "Assistant.noContactMatch" }
  return {
    kind: "answer",
    payload: {
      username: only.username,
      alias: only.alias ?? null,
      defaultWallet: { id: wallet.id, walletCurrency: wallet.walletCurrency },
    },
  }
}

export const resolveContact = defineRead({
  intent: "resolveContact",
  description:
    "Find one of the user's contacts by what the user called them; asks when unsure, and offers the Flash user of that username when no contact matches.",
  input: {
    type: "object",
    properties: {
      hint: { type: "string", pattern: "^[\\s\\S]{1,80}$" },
    },
    required: ["hint"],
    additionalProperties: false,
  },
  run,
  project: projectContact,
})
