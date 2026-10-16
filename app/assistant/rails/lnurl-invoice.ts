import { requestInvoice, utils } from "lnurl-pay"

// An invoice from an LNURL-pay service (a Lightning address or an LNURL
// that is not a Flash user's), as the send details screen asks for one
// before a cash-wallet send (send-bitcoin-details-screen.tsx, goToNextScreen).
// The cash wallet pays a bolt11 through lnInvoicePaymentSend, so an LNURL
// payee needs one minted at the amount first. A BTC-wallet send does not ask:
// payLnurlBreez mints its own invoice at send time.

export type LnurlInvoiceRequest = (args: {
  lnUrlOrAddress: string
  /** The amount, in sats. */
  sats: number
  /** Sent only when the service allows a comment. */
  comment?: string
}) => Promise<{ invoice: string }>

/** The send details screen's own limit on the service's answer. */
export const LNURL_INVOICE_TIMEOUT_MS = 30_000

export class LnurlInvoiceTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The LNURL service did not answer within ${timeoutMs} ms`)
    this.name = "LnurlInvoiceTimeoutError"
  }
}

type RequestInvoice = (args: {
  lnUrlOrAddress: string
  tokens: ReturnType<typeof utils.toSats>
  comment?: string
}) => Promise<{ invoice: string }>

export const createLnurlInvoiceRequest = ({
  request = requestInvoice,
  timeoutMs = LNURL_INVOICE_TIMEOUT_MS,
}: { request?: RequestInvoice; timeoutMs?: number } = {}): LnurlInvoiceRequest => {
  return async ({ lnUrlOrAddress, sats, comment }) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LnurlInvoiceTimeoutError(timeoutMs)), timeoutMs)
    })
    try {
      const { invoice } = await Promise.race([
        request({
          lnUrlOrAddress,
          tokens: utils.toSats(sats),
          ...(comment === undefined ? {} : { comment }),
        }),
        timedOut,
      ])
      return { invoice }
    } finally {
      clearTimeout(timer)
    }
  }
}
