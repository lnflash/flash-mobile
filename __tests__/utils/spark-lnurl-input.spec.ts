import { lnurlPayRequestDetailsFromInput } from "@app/utils/breez-sdk/spark"

describe("lnurlPayRequestDetailsFromInput", () => {
  const payRequest = {
    callback: "https://example.com/lnurl/callback",
    minSendable: BigInt(1),
    maxSendable: BigInt(1000),
    metadataStr: "[]",
    commentAllowed: 0,
    allowsNostr: false,
    nostrPubkey: undefined,
    payerData: undefined,
  }

  it("uses the pay request from a Spark lightning address input", () => {
    const input = { tag: "LightningAddress", inner: [{ payRequest }] }

    expect(lnurlPayRequestDetailsFromInput(input as never)).toBe(payRequest)
  })

  it("uses the pay request from an encoded Spark LNURL-pay input", () => {
    const input = { tag: "LnurlPay", inner: [payRequest] }

    expect(lnurlPayRequestDetailsFromInput(input as never)).toBe(payRequest)
  })

  it("returns null for non-LNURL pay inputs", () => {
    const input = { tag: "Bolt11Invoice", inner: [{ invoice: "lnbc1..." }] }

    expect(lnurlPayRequestDetailsFromInput(input as never)).toBeNull()
  })
})
