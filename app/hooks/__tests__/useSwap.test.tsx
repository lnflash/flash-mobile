import { renderHook } from "@testing-library/react-native"
import { i18nObject } from "../../i18n/i18n-util"
import { loadAllLocales } from "../../i18n/i18n-util.sync"
import { useSwap } from "../useSwap"
import { payLightningBreez, receivePaymentBreez } from "@app/utils/breez-sdk"
import { PaymentStatus } from "@breeztech/breez-sdk-spark-react-native"

loadAllLocales()

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

const mockLnInvoicePaymentSend = jest.fn()
const mockLnUsdInvoiceFeeProbe = jest.fn()
const mockLnUsdInvoiceCreate = jest.fn()

jest.mock("@app/graphql/generated", () => ({
  WalletCurrency: { Btc: "BTC", Usd: "USD", Usdt: "USDT" },
  HomeAuthedDocument: "HomeAuthedDocument",
  useLnInvoicePaymentSendMutation: () => [
    (...args: unknown[]) => mockLnInvoicePaymentSend(...args),
  ],
  useLnUsdInvoiceFeeProbeMutation: () => [
    (...args: unknown[]) => mockLnUsdInvoiceFeeProbe(...args),
  ],
  useLnUsdInvoiceCreateMutation: () => [
    (...args: unknown[]) => mockLnUsdInvoiceCreate(...args),
  ],
  useConversionScreenQuery: () => ({
    data: {
      me: {
        defaultAccount: {
          wallets: [{ id: "usd-wallet-id", walletCurrency: "USD", balance: 541 }],
        },
      },
    },
  }),
}))

jest.mock("@app/graphql/wallets-utils", () => ({
  getCashWallet: (wallets: { id: string }[] | undefined) => wallets?.[0],
}))

jest.mock("@app/utils/breez-sdk", () => ({
  fetchBreezFee: jest.fn(),
  payLightningBreez: jest.fn(),
  receivePaymentBreez: jest.fn(),
}))

jest.mock("../useBreez", () => ({
  useBreez: () => ({ btcWallet: { id: "btc-wallet-id", balance: 8453 } }),
}))

jest.mock("../use-price-conversion", () => ({
  usePriceConversion: () => ({
    convertMoneyAmount: (amount: { amount: number }) => amount,
  }),
}))

jest.mock("../use-display-currency", () => ({
  useDisplayCurrency: () => ({ formatDisplayAndWalletAmount: () => "J$0.00" }),
}))

jest.mock("../use-format-sats", () => ({
  useFormatSats: () => (sats: number) => `${sats} sats`,
}))

const mockPayLightningBreez = payLightningBreez as jest.Mock
const mockReceivePaymentBreez = receivePaymentBreez as jest.Mock

const sendResult = (status: string | null, errors: { message: string }[] = []) => ({
  data: { lnInvoicePaymentSend: { status, errors } },
})

const renderUseSwap = () => renderHook(() => useSwap()).result

beforeEach(() => jest.clearAllMocks())

describe("useSwap — swap() result reporting", () => {
  it("reports a settled payment as success", async () => {
    mockLnInvoicePaymentSend.mockResolvedValue(sendResult("SUCCESS"))

    const { current } = renderUseSwap()
    await expect(current.swap("lnbc1", "USD", 540)).resolves.toEqual({
      status: "success",
    })
  })

  it("reports PENDING as pending, not success", async () => {
    // The regression: pending was returned as `true` and rendered as a
    // completed conversion, so a payment that moved no funds looked settled.
    mockLnInvoicePaymentSend.mockResolvedValue(sendResult("PENDING"))

    const { current } = renderUseSwap()
    await expect(current.swap("lnbc1", "USD", 540)).resolves.toEqual({
      status: "pending",
    })
  })

  it("throws the server error even when it accompanies a PENDING status", async () => {
    // The API reports a payment it could not confirm as PENDING carrying an
    // error; status must not win over that error.
    mockLnInvoicePaymentSend.mockResolvedValue(
      sendResult("PENDING", [{ message: "We could not confirm the status" }]),
    )

    const { current } = renderUseSwap()
    await expect(current.swap("lnbc1", "USD", 540)).rejects.toThrow(/could not confirm/i)
  })

  it("throws on an unrecognised status instead of resolving", async () => {
    mockLnInvoicePaymentSend.mockResolvedValue(sendResult(null))

    const { current } = renderUseSwap()
    await expect(current.swap("lnbc1", "USD", 540)).rejects.toThrow()
  })

  it("throws when a Breez send fails rather than resolving undefined", async () => {
    // Previously this branch fell off the end returning undefined, which the
    // confirmation screen read as "nothing happened" — no success, no error.
    mockPayLightningBreez.mockResolvedValue({ success: false, error: "no route" })

    const { current } = renderUseSwap()
    await expect(current.swap("lnbc1", "BTC", 8442)).rejects.toThrow(/no route/)
  })

  it("reports a completed Breez send as success and an unsettled one as pending", async () => {
    mockPayLightningBreez.mockResolvedValueOnce({
      success: true,
      payment: { payment: { status: PaymentStatus.Completed } },
    })
    const { current } = renderUseSwap()
    await expect(current.swap("lnbc1", "BTC", 8442)).resolves.toEqual({
      status: "success",
    })

    mockPayLightningBreez.mockResolvedValueOnce({
      success: true,
      payment: { payment: { status: PaymentStatus.Pending } },
    })
    await expect(current.swap("lnbc1", "BTC", 8442)).resolves.toEqual({
      status: "pending",
    })
  })

  it("throws when Breez reports the send failed", async () => {
    mockPayLightningBreez.mockResolvedValue({
      success: true,
      payment: { payment: { status: PaymentStatus.Failed } },
    })

    const { current } = renderUseSwap()
    await expect(current.swap("lnbc1", "BTC", 8442)).rejects.toThrow()
  })
})

describe("useSwap — prepareUsdToBtc() fee probe", () => {
  beforeEach(() => {
    mockReceivePaymentBreez.mockResolvedValue({
      paymentRequest: "lnbc-breez-invoice",
      fee: 0,
    })
  })

  it("surfaces a fee-probe error instead of continuing with fee 0", async () => {
    mockLnUsdInvoiceFeeProbe.mockResolvedValue({
      data: {
        lnUsdInvoiceFeeProbe: {
          errors: [{ message: "An error occurred. Contact support" }],
          amount: null,
        },
      },
    })

    const { current } = renderUseSwap()
    const res = await current.prepareUsdToBtc({
      amount: 100,
      currency: "USD",
      currencyCode: "USD",
    })

    expect(res.data).toBeNull()
    expect(res.err).toMatch(/an error occurred/i)
  })

  it("does not treat a missing probe amount as a zero fee", async () => {
    mockLnUsdInvoiceFeeProbe.mockResolvedValue({
      data: { lnUsdInvoiceFeeProbe: { errors: [], amount: null } },
    })

    const { current } = renderUseSwap()
    const res = await current.prepareUsdToBtc({
      amount: 100,
      currency: "USD",
      currencyCode: "USD",
    })

    expect(res.data).toBeNull()
    expect(res.err).toBeTruthy()
  })

  it("passes the probed fee through when the probe succeeds", async () => {
    mockLnUsdInvoiceFeeProbe.mockResolvedValue({
      data: { lnUsdInvoiceFeeProbe: { errors: [], amount: 2 } },
    })

    const { current } = renderUseSwap()
    const res = await current.prepareUsdToBtc({
      amount: 100,
      currency: "USD",
      currencyCode: "USD",
    })

    expect(res.err).toBeNull()
    expect(res.data).toMatchObject({ lnInvoice: "lnbc-breez-invoice" })
  })
})
