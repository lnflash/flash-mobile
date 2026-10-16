import {
  createLnurlInvoiceRequest,
  LNURL_INVOICE_TIMEOUT_MS,
  LnurlInvoiceTimeoutError,
} from "@app/assistant/rails/lnurl-invoice"

afterEach(() => {
  jest.useRealTimers()
})

describe("createLnurlInvoiceRequest", () => {
  it("asks the service for an invoice at the amount in sats, and hands back the invoice", async () => {
    const request = jest.fn(async () => ({
      invoice: "lnbc21u1",
      params: {},
      rawData: {},
    }))

    const invoice = await createLnurlInvoiceRequest({ request })({
      lnUrlOrAddress: "carol@blink.sv",
      sats: 2100,
      comment: "lunch",
    })

    expect(invoice).toEqual({ invoice: "lnbc21u1" })
    expect(request).toHaveBeenCalledWith({
      lnUrlOrAddress: "carol@blink.sv",
      tokens: 2100,
      comment: "lunch",
    })
  })

  it("sends no comment when there is none", async () => {
    const request = jest.fn(async () => ({ invoice: "lnbc21u1" }))

    await createLnurlInvoiceRequest({ request })({
      lnUrlOrAddress: "carol@blink.sv",
      sats: 1,
    })

    expect(request.mock.calls[0]).toEqual([
      { lnUrlOrAddress: "carol@blink.sv", tokens: 1 },
    ])
  })

  it("gives up on a service that does not answer within the send screen's 30 s", async () => {
    jest.useFakeTimers()
    // A service that never answers.
    const never = new Promise<{ invoice: string }>(() => {
      // never settles
    })
    const request = jest.fn(() => never)

    const asked = createLnurlInvoiceRequest({ request })({
      lnUrlOrAddress: "slow@example.com",
      sats: 1,
    })
    jest.advanceTimersByTime(LNURL_INVOICE_TIMEOUT_MS)

    await expect(asked).rejects.toBeInstanceOf(LnurlInvoiceTimeoutError)
    expect(LNURL_INVOICE_TIMEOUT_MS).toBe(30_000)
  })
})
