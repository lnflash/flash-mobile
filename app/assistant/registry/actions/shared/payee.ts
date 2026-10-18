import {
  Network as NetworkGaloyClient,
  parsePaymentDestination,
  PaymentType,
} from "@flash/client"

import { LNURL_DOMAINS } from "@app/config/appinfo"
import { parseDestination } from "@app/screens/send-bitcoin-screen/payment-destination"
import {
  DestinationDirection,
  InvalidDestinationReason,
  PaymentDestination,
} from "@app/screens/send-bitcoin-screen/payment-destination/index.types"
import { createIntraLedgerDestination } from "@app/screens/send-bitcoin-screen/payment-destination/intraledger"
import { createReadToolCtx } from "../../../engine/run-tool"
import type { ContactPayload } from "../../projections"
import { accountDefaultWalletQueryOver } from "../../read/decode-payment-request"
import { flashUserWallet, resolveContact } from "../../read/resolve-contact"
import type {
  ActionToolCtx,
  AssistantReplyKey,
  ClarificationCard,
  PrepareRefusalCard,
} from "../../types"

// Who a send pays (spec §4, §5, §8). A payee is one of three things:
//
// - A person the user names ("mom", "Alice Smith"): resolveContact
//   (ENG-687) finds the contact, and asks when it is not sure. A bare word is
//   looked up as a Flash username only once resolveContact finds no contact
//   like it at all, and only as a question (ENG-730, narrowing ENG-688
//   decision 2): "mom" may be a stranger's username, so that user is a
//   picker of one whose prompt says they are not in the contacts, never a
//   payee straight away. The user's own username is the self-payment reply,
//   and no contact and no Flash user is a refusal card.
// - A person the user picked from that question: `contact:<username>`, the
//   id of every option such a question offers. A pick is re-issued in the
//   same call, and resolves to exactly that contact, or else to the Flash
//   user of that username, looked up again at the tap, so a question is
//   never asked twice for the same answer.
// - A payment request, address or link: a bolt11, an LNURL, a Lightning
//   address (a Flash user's included), an on-chain address. The send flow's
//   own parser resolves it (send-bitcoin-screen/payment-destination).

/** The prefix of the payee a picked clarification option stands for. */
export const CONTACT_PICK_PREFIX = "contact:"

/** The payee string a picker option for this contact re-issues. */
export const contactPick = (username: string): string =>
  `${CONTACT_PICK_PREFIX}${username}`

export type PayeeKind = "contact" | "flashUser" | "lnurl" | "lightning" | "onchain"

export type ResolvedPayee = {
  kind: PayeeKind
  /** The parser's answer: it builds the PaymentDetail. */
  destination: PaymentDestination
  /** What the card calls the payee: the contact's name, the address, the invoice shortened. */
  label: string
  /** A Flash user's full username, which every card naming them shows (spec §4, §6). */
  username?: string
  /** The recipient's wallet, for a Flash user. */
  recipientWalletId?: string
}

export type PayeeResolution =
  | { kind: "payee"; payee: ResolvedPayee }
  | { kind: "clarification"; card: ClarificationCard }
  /** A reply, and the refusal card that says it when there is one (payeeNotFound). */
  | { kind: "error"; replyKey: AssistantReplyKey; card?: PrepareRefusalCard }

const error = (
  replyKey: AssistantReplyKey,
  card?: PrepareRefusalCard,
): PayeeResolution => ({
  kind: "error",
  replyKey,
  ...(card ? { card } : {}),
})

/** The longest contact name resolveContact takes (its own schema). */
const CONTACT_HINT_MAX = 80

/** The start of a payment request or an address, which no contact name has. */
const PAYMENT_REQUEST_PREFIX = /^(?:lnbc|lntb|lnurl|lightning:|bitcoin:|bc1|tb1|bcrt1)/i

/**
 * Whether the payee names a destination rather than a person. The parser
 * calls a bare word a Flash username; only an address or a link that says
 * so ("alice@flashapp.me", "https://flashapp.me/alice") is taken as one.
 */
const namesDestination = (raw: string): boolean => {
  if (PAYMENT_REQUEST_PREFIX.test(raw)) return true
  const parsed = parsePaymentDestination({
    destination: raw,
    network: "mainnet" as NetworkGaloyClient, // as parseDestination
    lnAddressDomains: LNURL_DOMAINS,
  })
  switch (parsed.paymentType) {
    case PaymentType.Lightning:
    case PaymentType.Lnurl:
    case PaymentType.Onchain:
      return true
    case PaymentType.Intraledger:
    case PaymentType.IntraledgerWithFlag:
      return /[@/]/.test(raw)
    default:
      return false
  }
}

/** A long bolt11, as a card can show it. */
const shortInvoice = (paymentRequest: string): string =>
  paymentRequest.length > 24
    ? `${paymentRequest.slice(0, 14)}…${paymentRequest.slice(-8)}`
    : paymentRequest

const flashUser = (
  kind: "contact" | "flashUser",
  {
    username,
    alias,
    walletId,
  }: { username: string; alias?: string | null; walletId: string },
  myWalletIds: readonly string[],
): PayeeResolution => {
  if (myWalletIds.includes(walletId)) return error("Assistant.selfPayment")
  return {
    kind: "payee",
    payee: {
      kind,
      destination: createIntraLedgerDestination({
        parsedIntraledgerDestination: {
          paymentType: PaymentType.Intraledger,
          handle: username,
          valid: true,
        },
        walletId,
      }),
      label: alias || username,
      username,
      recipientWalletId: walletId,
    },
  }
}

/**
 * A pick: exactly that contact, or else the Flash user of that username
 * (ENG-730), or nothing. A Flash user is looked up now, at the tap, and never
 * taken from the question's own lookup: the account may be gone since.
 */
const fromPick = async (
  username: string,
  ctx: Pick<ActionToolCtx, "graphql">,
  myWalletIds: readonly string[],
): Promise<PayeeResolution> => {
  const contact = (await ctx.graphql.contacts()).find(
    (candidate) => candidate.username.toLowerCase() === username.toLowerCase(),
  )
  if (!contact) {
    const userWallet = await flashUserWallet(username, ctx.graphql)
    if (!userWallet) {
      return error("Assistant.payeeNotFound", {
        type: "prepareRefused",
        reason: "payeeNotFound",
      })
    }
    // The self-payment check holds here as for a contact.
    return flashUser(
      "flashUser",
      { username, alias: null, walletId: userWallet.id },
      myWalletIds,
    )
  }
  const wallet = await ctx.graphql.accountDefaultWallet(contact.username)
  if (!wallet) return error("Assistant.noContactMatch")
  return flashUser(
    "contact",
    { username: contact.username, alias: contact.alias, walletId: wallet.id },
    myWalletIds,
  )
}

/** A contact by name, through resolveContact: one sure match, or a question. */
const fromContactName = async (
  hint: string,
  ctx: ActionToolCtx,
  myWalletIds: readonly string[],
): Promise<PayeeResolution> => {
  if (hint.length > CONTACT_HINT_MAX) return error("Assistant.invalidDestination")
  const result = await resolveContact.run(
    { hint },
    createReadToolCtx({ ...ctx, lnAddressHostname: ctx.send.lnAddressHostname }),
  )
  switch (result.kind) {
    case "clarification":
      // Each option re-issues the call with its pick in place of the name
      // the question is about, and a pick resolves to exactly that contact,
      // or to the Flash user of that username when it is no contact's.
      return {
        kind: "clarification",
        card: {
          ...result.card,
          options: result.card.options.map((option) => ({
            ...option,
            id: contactPick(option.id),
          })),
          about: hint,
        },
      }
    case "answer": {
      const contact = result.payload as ContactPayload
      return flashUser(
        "contact",
        {
          username: contact.username,
          alias: contact.alias,
          walletId: contact.defaultWallet.id,
        },
        myWalletIds,
      )
    }
    case "error":
      // No contact and no Flash user: the refusal card comes along.
      return error(result.userMessage, result.card)
    default:
      return error("Assistant.toolFailed")
  }
}

const DESTINATION_REPLY: Partial<Record<InvalidDestinationReason, AssistantReplyKey>> = {
  [InvalidDestinationReason.InvoiceExpired]: "Assistant.invoiceExpired",
  [InvalidDestinationReason.SelfPayment]: "Assistant.selfPayment",
}

/** A destination, through the send flow's own parser. */
const fromDestination = async (
  raw: string,
  ctx: Pick<ActionToolCtx, "graphql">,
  myWalletIds: readonly string[],
): Promise<PayeeResolution> => {
  const result = await parseDestination({
    rawInput: raw,
    myWalletIds: [...myWalletIds],
    bitcoinNetwork: "mainnet", // parseDestination hard-codes mainnet too
    lnurlDomains: LNURL_DOMAINS,
    accountDefaultWalletQuery: accountDefaultWalletQueryOver(ctx.graphql),
  })
  if (!result.valid) {
    return error(
      DESTINATION_REPLY[result.invalidReason] ?? "Assistant.invalidDestination",
    )
  }
  // An LNURL-withdraw link pays the user: there is nothing to send.
  if (result.destinationDirection !== DestinationDirection.Send) {
    return error("Assistant.invalidDestination")
  }
  const destination = result.validDestination
  const payee = (rest: Omit<ResolvedPayee, "destination">): PayeeResolution => ({
    kind: "payee",
    payee: { ...rest, destination: result },
  })
  switch (destination.paymentType) {
    case PaymentType.Intraledger:
    case PaymentType.IntraledgerWithFlag:
      return payee({
        kind: "flashUser",
        label: destination.handle,
        username: destination.handle,
        recipientWalletId: destination.walletId,
      })
    case PaymentType.Lnurl:
      return payee({
        kind: "lnurl",
        label: destination.lnurlParams.identifier || destination.lnurl,
      })
    case PaymentType.Lightning:
      return payee({ kind: "lightning", label: shortInvoice(destination.paymentRequest) })
    case PaymentType.Onchain:
      return payee({ kind: "onchain", label: destination.address })
    default:
      return error("Assistant.invalidDestination")
  }
}

/** Resolve what a call says to pay into a payee, a question, or a reply. */
export const resolvePayee = async (
  raw: string,
  ctx: ActionToolCtx,
  myWalletIds: readonly string[],
): Promise<PayeeResolution> => {
  const payee = raw.trim()
  if (payee.toLowerCase().startsWith(CONTACT_PICK_PREFIX)) {
    return fromPick(payee.slice(CONTACT_PICK_PREFIX.length), ctx, myWalletIds)
  }
  if (namesDestination(payee)) return fromDestination(payee, ctx, myWalletIds)
  return fromContactName(payee, ctx, myWalletIds)
}
