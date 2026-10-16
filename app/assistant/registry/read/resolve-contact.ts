import Fuse from "fuse.js"

import type { ContactRow } from "../../rails/graphql-rail"
import { defineRead } from "../define"
import { ContactPayload, projectContact } from "../projections"
import type { ClarificationOption, ReadToolCtx, ToolResult } from "../types"

// resolveContact (docs/ai-assistant-tool-registry.md §4): turn what the user
// called someone ("mom", "bob") into one Flash contact, or ask. It never
// guesses: no match, several matches, or one weak match all come back as a
// clarification, so a payee is only ever named by the user's own pick.
// It never prepares anything either.

/**
 * Similarity (1 minus Fuse's score, so 1 is an exact match) at or above
 * which a single match is taken without asking. A first guess, until the
 * phrasing corpus of spec §9 can tune it.
 */
export const CONTACT_MATCH_THRESHOLD = 0.8

/**
 * Similarity below which a contact is not a candidate at all (Fuse threshold
 * 0.4). Fuse's own default, 0.6, offers "alice" for "carl": noise in a
 * picker. Also a first guess until the corpus exists.
 */
export const CONTACT_CANDIDATE_THRESHOLD = 0.6

/** The most contacts a picker offers. */
export const CONTACT_PICKER_LIMIT = 5

type Args = { hint: string }

type Candidate = { contact: ContactRow; similarity: number }

const findCandidates = (contacts: readonly ContactRow[], hint: string): Candidate[] =>
  new Fuse(contacts, {
    keys: ["alias", "username"],
    includeScore: true,
    ignoreLocation: true,
    threshold: 1 - CONTACT_CANDIDATE_THRESHOLD,
  })
    .search(hint.trim())
    .map(({ item, score }) => ({ contact: item, similarity: 1 - (score ?? 1) }))

// Every option shows the full username, whatever alias the user gave it.
const option = ({ contact }: Candidate): ClarificationOption => ({
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
  const [best] = candidates
  if (candidates.length > 1 || best.similarity < CONTACT_MATCH_THRESHOLD) {
    // Several matches, or one the score does not vouch for: the user picks,
    // from at most CONTACT_PICKER_LIMIT, best first.
    return {
      kind: "clarification",
      card: {
        type: "clarification",
        prompt: "Assistant.pickContact",
        options: candidates.slice(0, CONTACT_PICKER_LIMIT).map(option),
      },
    }
  }

  const wallet = await ctx.graphql.accountDefaultWallet(best.contact.username)
  if (!wallet) return { kind: "error", userMessage: "Assistant.noContactMatch" }
  return {
    kind: "answer",
    payload: {
      username: best.contact.username,
      alias: best.contact.alias ?? null,
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
