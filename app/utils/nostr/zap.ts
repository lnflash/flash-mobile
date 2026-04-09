import { getSigner } from "@app/nostr/signer"

const ZAP_RELAYS = [
  "wss://relay.flashapp.me",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
]

/**
 * Resolve the LNURL pay-params URL for a lud16 address.
 *
 * Flash/ibex users (domain matches lnAddressHostname) use the ibex endpoint
 * which is derived from the galoy instance config so it works across all
 * environments (main, staging, test, etc.).
 *
 * All other users use the NIP-57 well-known endpoint.
 */
const lnurlParamsUrl = (user: string, domain: string, lnAddressHostname: string): string => {
  if (domain === lnAddressHostname) {
    return `https://ibex.${lnAddressHostname}/pay/lnurl/${user}`
  }
  return `https://${domain}/.well-known/lnurlp/${user}`
}

/**
 * Send a NIP-57 zap to a recipient.
 *
 * Flow:
 *   1. Fetch LNURL pay params (ibex endpoint for Flash users, well-known for others)
 *   2. Build the kind-9734 zap request if the service supports NIP-57 (allowsNostr)
 *   3. Call the LNURL callback with amount + optional nostr param to get an invoice
 *   4. Call payInvoice(pr) — provided by the caller so it can use whatever payment
 *      method the user has (Galoy GraphQL, Breez SDK, etc.)
 *
 * The receiver's wallet is responsible for publishing the zap receipt (kind 9735).
 */
export const sendZap = async ({
  recipientPubkey,
  lud16,
  amountSats,
  lnAddressHostname,
  payInvoice,
  comment,
}: {
  recipientPubkey: string
  lud16: string
  amountSats: number
  lnAddressHostname: string
  payInvoice: (pr: string) => Promise<{ success: boolean; error?: string }>
  comment?: string
}): Promise<{ success: boolean; error?: string }> => {
  try {
    const parts = lud16.split("@")
    if (parts.length !== 2) {
      return { success: false, error: "Invalid lightning address" }
    }
    const [user, domain] = parts

    // 1. Fetch LNURL pay params
    const paramsRes = await fetch(lnurlParamsUrl(user, domain, lnAddressHostname))
    const params = await paramsRes.json()

    if (params.status === "ERROR") {
      return { success: false, error: params.reason || "LNURL error" }
    }

    const amountMsats = amountSats * 1000

    if (params.minSendable && amountMsats < params.minSendable) {
      return { success: false, error: `Minimum is ${params.minSendable / 1000} sats` }
    }
    if (params.maxSendable && amountMsats > params.maxSendable) {
      return { success: false, error: `Maximum is ${params.maxSendable / 1000} sats` }
    }

    // 2. Build the callback params — attach zap request if supported
    const callbackParams = new URLSearchParams({ amount: String(amountMsats) })
    if (comment) callbackParams.set("comment", comment)

    if (params.allowsNostr === true && typeof params.nostrPubkey === "string") {
      const signer = await getSigner()
      const signedZapRequest = await signer.signEvent({
        kind: 9734,
        created_at: Math.floor(Date.now() / 1000),
        content: comment || "",
        tags: [
          ["relays", ...ZAP_RELAYS],
          ["amount", String(amountMsats)],
          ["lnurl", lud16],
          ["p", recipientPubkey],
        ],
      })
      callbackParams.set("nostr", JSON.stringify(signedZapRequest))
    }

    // 3. Fetch the invoice
    const invoiceRes = await fetch(`${params.callback}?${callbackParams.toString()}`)
    const invoiceData = await invoiceRes.json()

    if (invoiceData.status === "ERROR") {
      return { success: false, error: invoiceData.reason || "Invoice error" }
    }
    if (!invoiceData.pr) {
      return { success: false, error: "No invoice returned from LNURL service" }
    }

    // 4. Pay via caller-supplied method (Galoy GraphQL, Breez SDK, etc.)
    return payInvoice(invoiceData.pr)
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
