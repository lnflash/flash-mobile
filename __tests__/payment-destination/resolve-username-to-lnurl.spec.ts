import { PaymentType } from "@galoymoney/client"
import { WalletCurrency } from "@app/graphql/generated"
import { InvalidDestinationReason } from "@app/screens/send-bitcoin-screen/payment-destination/index.types"

const mockParsePaymentDestination = jest.fn()
jest.mock("@flash/client", () => ({
  parsePaymentDestination: (...args: unknown[]) => mockParsePaymentDestination(...args),
  Network: {},
}))

const mockRequestPayServiceParams = jest.fn()
jest.mock("lnurl-pay", () => ({
  requestPayServiceParams: (...args: unknown[]) => mockRequestPayServiceParams(...args),
}))

const mockCreateLnurlPaymentDestination = jest.fn()
jest.mock("@app/screens/send-bitcoin-screen/payment-destination/lnurl", () => ({
  createLnurlPaymentDestination: (...args: unknown[]) =>
    mockCreateLnurlPaymentDestination(...args),
}))

import { maybeResolveManualUsernameToLnurl } from "@app/screens/send-bitcoin-screen/payment-destination/resolve-username-to-lnurl"

const LN_ADDRESS_HOSTNAME = "flashapp.me"

const baseParams = {
  rawInput: "satoshi",
  myWalletIds: ["my-usd-wallet"],
  lnAddressHostname: LN_ADDRESS_HOSTNAME,
}

const intraledgerParse = {
  paymentType: PaymentType.Intraledger,
  valid: true,
  handle: "satoshi",
}

describe("maybeResolveManualUsernameToLnurl", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns null for a non-intraledger destination (falls back to parseDestination)", async () => {
    mockParsePaymentDestination.mockReturnValue({
      paymentType: PaymentType.Lightning,
      valid: true,
    })
    const accountDefaultWalletQuery = jest.fn()

    const result = await maybeResolveManualUsernameToLnurl({
      ...baseParams,
      accountDefaultWalletQuery,
    })

    expect(result).toBeNull()
    expect(accountDefaultWalletQuery).not.toHaveBeenCalled()
  })

  it("returns null when the recipient's default wallet is not BTC", async () => {
    mockParsePaymentDestination.mockReturnValue(intraledgerParse)
    const accountDefaultWalletQuery = jest.fn().mockResolvedValue({
      data: { accountDefaultWallet: { id: "their-usd-wallet", walletCurrency: WalletCurrency.Usd } },
    })

    const result = await maybeResolveManualUsernameToLnurl({
      ...baseParams,
      accountDefaultWalletQuery,
    })

    expect(result).toBeNull()
    expect(mockRequestPayServiceParams).not.toHaveBeenCalled()
  })

  it("returns a self-payment error when the BTC wallet belongs to the sender", async () => {
    mockParsePaymentDestination.mockReturnValue(intraledgerParse)
    const accountDefaultWalletQuery = jest.fn().mockResolvedValue({
      data: { accountDefaultWallet: { id: "my-usd-wallet", walletCurrency: WalletCurrency.Btc } },
    })

    const result = await maybeResolveManualUsernameToLnurl({
      ...baseParams,
      accountDefaultWalletQuery,
    })

    expect(result).toEqual({
      valid: false,
      invalidReason: InvalidDestinationReason.SelfPayment,
      invalidPaymentDestination: intraledgerParse,
    })
  })

  it("re-routes a BTC-default recipient through LNURL using handle@hostname", async () => {
    mockParsePaymentDestination.mockReturnValue(intraledgerParse)
    const accountDefaultWalletQuery = jest.fn().mockResolvedValue({
      data: { accountDefaultWallet: { id: "their-btc-wallet", walletCurrency: WalletCurrency.Btc } },
    })
    const lnurlParams = { min: 1, max: 1000 }
    mockRequestPayServiceParams.mockResolvedValue(lnurlParams)
    const lnurlDestination = { valid: true, destinationDirection: "Send" }
    mockCreateLnurlPaymentDestination.mockReturnValue(lnurlDestination)

    const result = await maybeResolveManualUsernameToLnurl({
      ...baseParams,
      accountDefaultWalletQuery,
    })

    expect(mockRequestPayServiceParams).toHaveBeenCalledWith({
      lnUrlOrAddress: `satoshi@${LN_ADDRESS_HOSTNAME}`,
    })
    expect(mockCreateLnurlPaymentDestination).toHaveBeenCalledWith({
      paymentType: PaymentType.Lnurl,
      valid: true,
      lnurl: `satoshi@${LN_ADDRESS_HOSTNAME}`,
      lnurlParams,
    })
    expect(result).toBe(lnurlDestination)
  })

  it("returns an LnurlError when the lightning address cannot be resolved", async () => {
    mockParsePaymentDestination.mockReturnValue(intraledgerParse)
    const accountDefaultWalletQuery = jest.fn().mockResolvedValue({
      data: { accountDefaultWallet: { id: "their-btc-wallet", walletCurrency: WalletCurrency.Btc } },
    })
    mockRequestPayServiceParams.mockRejectedValue(new Error("not found"))

    const result = await maybeResolveManualUsernameToLnurl({
      ...baseParams,
      accountDefaultWalletQuery,
    })

    expect(result).toEqual({
      valid: false,
      invalidReason: InvalidDestinationReason.LnurlError,
      invalidPaymentDestination: {
        paymentType: PaymentType.Lnurl,
        valid: false,
        invalidReason: "unknown",
      },
    })
  })
})
