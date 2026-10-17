import Fuse from "fuse.js"

import type { ContactRow } from "../../rails/graphql-rail"
import { defineRead } from "../define"
import { ContactPayload, projectContact } from "../projections"
import type { ClarificationOption, ReadToolCtx, ToolResult } from "../types"

// resolveContact (docs/ai-assistant-tool-registry.md §4): turn what the user
// called someone ("mom", "bob") into one Flash contact, or ask. It never
// guesses: no match, several matches, or one match the hint does not name
// exactly all come back as a clarification, so a payee is only ever named by
// the user's own words for them or by the user's own pick.
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
 * name, as are "D'Andre" and "D’Andre".
 */
const comparable = (name: string): string =>
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
 * getTransactions reads the names in a search the same way.
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

const run = async (
  { hint }: Args,
  ctx: ReadToolCtx,
): Promise<ToolResult<ContactPayload>> => {
  const candidates = findCandidates(await ctx.graphql.contacts(), hint)

  if (candidates.length === 0) {
    return {
      kind: "clarification",
      card: { type: "clarification", prompt: "Assistant.noContactMatch", options: [] },
    }
  }
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
    "Find one of the user's contacts by what the user called them; asks when unsure.",
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
