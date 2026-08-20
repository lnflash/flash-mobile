import React, { PropsWithChildren } from "react"

import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { Intraledger } from "../../app/screens/send-bitcoin-screen/send-bitcoin-confirmation-screen.stories"
import { ContextForScreen } from "./helper"

import SendBitcoinConfirmationScreen from "@app/screens/send-bitcoin-screen/send-bitcoin-confirmation-screen"
import {
  createAmountLightningPaymentDetails,
  createLnurlPaymentDetails,
} from "@app/screens/send-bitcoin-screen/payment-details/lightning"
import { ConvertMoneyAmount } from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import { BreezContext } from "@app/contexts/BreezContext"
import { WalletCurrency } from "@app/graphql/generated"
import { DisplayCurrency, toBtcMoneyAmount } from "@app/types/amounts"
import { payLightningBreez, payLnurlBreez } from "@app/utils/breez-sdk"
import { getAnalytics } from "@react-native-firebase/analytics"
import baseTranslation from "@app/i18n/en"
import type { Translation } from "@app/i18n/i18n-types"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { LnUrlPayServiceResponse, Satoshis } from "lnurl-pay/dist/types/types"
import { createMock } from "ts-auto-mock"

// ContextForScreen mounts TypesafeI18n but nothing loads the dictionary, so
// every LL.*() renders as "" until this runs. The expiry assertions below are
// about which copy the user sees, so they need the real strings.
loadLocale("en")

// The source dictionary is exported as the loose `BaseTranslation`; the
// generated `Translation` shape is what actually describes it. Asserting
// against these rather than string literals means renaming a key or editing
// the copy cannot leave a test quietly asserting the wrong sentence.
const en = baseTranslation as Translation

it("SendScreen Confirmation", async () => {
  const { findByLabelText } = render(
    <ContextForScreen>
      <Intraledger />
    </ContextForScreen>,
  )

  // it seems we need multiple act because the component re-render multiple times
  // probably this could be debug with why-did-you-render
  await act(async () => {})
  await act(async () => {})

  await waitFor(async () => {
    const { children } = await findByLabelText("Successful Fee")
    expect(children).toEqual(["₦0.00 ($0.00)"])
  })
})

// ENG-555. The confirm screen holds whatever bolt11 was minted when the user
// left the amount screen, and Flash receive invoices die after 60 seconds.
// These drive the guard end to end: the detail factory really does surface
// the invoice, the screen really does decode it, and the refusal really does
// reach the user instead of a doomed round trip — while the one path that
// re-mints at send time is left alone.
describe("expired held invoice", () => {
  // The real invoice from the incident: issued 1787243982, expires 1787244042.
  const INCIDENT_INVOICE =
    "lnbc1p4gwtwwpp5wwulk8jw0llvgjadwzuen6nxh7hgmddplj3evpgjc7n8l5kzqvmqdph2pshjgr5dusyvmrpwd5zq4mpd3kx2apq24ek2u36ypj8yetpv3kkz7qcqzzsxqzpusp5wane88x5twmdlpnu4cqrk4wd6g3tks7xgq798nt9zt68vmcnnp6q9qxpqysgqnszg0ycjk4255es2hdd3ajep3yquuvra6jn4k8shskhpzg80mrl9m9pgylahzq80aw9ekz6e47ycpcf558080xrxn6uljn54lc447rqpn9u06u"
  const ISSUED = 1787243982
  const EXPIRES = 1787244042
  // The screen opens while the invoice is still alive — which is the only way
  // it can open, since parsePaymentDestination rejects an already-dead bolt11
  // at paste/scan time and an LNURL detail mints on the way in.
  const MOUNTED_MS = (ISSUED + 4) * 1000
  // The user's retry from the report, ~18 minutes past expiry.
  const LONG_AFTER_EXPIRY_MS = (EXPIRES + 18 * 60) * 1000
  // An ordinary pause on the confirm screen: 90 seconds, which outlives a
  // 60-second Flash invoice but leaves it younger than expiry + the 120s
  // clock-skew grace. Only the elapsed-since-mount reading can see this one.
  const AFTER_ORDINARY_PAUSE_MS = MOUNTED_MS + 90 * 1000

  const convertMoneyAmount: ConvertMoneyAmount = (moneyAmount, currency) => ({
    amount: moneyAmount.amount,
    currency,
    currencyCode: currency === DisplayCurrency ? "NGN" : currency,
  })

  const btcSendingWalletDescriptor = {
    currency: WalletCurrency.Btc,
    id: "testwallet",
  }
  // Small enough to sit under the 158-cent USD balance the mocked
  // SendBitcoinConfirmationScreen query returns, so Confirm is not disabled
  // for balance reasons and the test cannot pass vacuously.
  const amount = toBtcMoneyAmount(100)

  const lnurlParams = () =>
    createMock<LnUrlPayServiceResponse>({ min: 1 as Satoshis, max: 100000 as Satoshis })

  // The Breez wallet's balance drives the screen's own amount validation for
  // BTC sends; the context default is 0, which would disable Confirm.
  const WithFundedBreezWallet: React.FC<PropsWithChildren> = ({ children }) => (
    <BreezContext.Provider
      value={
        {
          refreshBreez: () => {},
          retryExternalWalletRegistration: async () => {},
          loading: false,
          externalWalletLoading: false,
          externalWalletError: undefined,
          btcWallet: {
            id: "breezwallet",
            walletCurrency: WalletCurrency.Btc,
            balance: 1_000_000,
            isExternal: true,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
      }
    >
      {children}
    </BreezContext.Provider>
  )

  const renderConfirmation = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paymentDetail: any,
  ) => {
    const navigate = jest.fn()
    const route = {
      key: "sendBitcoinConfirmationScreen",
      name: "sendBitcoinConfirmation",
      params: { paymentDetail },
    } as const

    const screen = render(
      <ContextForScreen>
        <WithFundedBreezWallet>
          <SendBitcoinConfirmationScreen
            route={route}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            navigation={{ navigate } as any}
          />
        </WithFundedBreezWallet>
      </ContextForScreen>,
    )

    await act(async () => {})
    await act(async () => {})

    // The screen reads the clock twice: once at mount, once when Send is
    // tapped. Advancing it between the two is what turns "the invoice looks
    // old" into "the user sat on this invoice", which is the only reading a
    // wrong device clock cannot fake.
    const confirm = (atMs: number = LONG_AFTER_EXPIRY_MS) =>
      act(async () => {
        jest.spyOn(Date, "now").mockReturnValue(atMs)
        fireEvent.press(screen.getByText(en.SendBitcoinConfirmationScreen.title))
      })

    return { ...screen, navigate, confirm }
  }

  const blockedEvents = () =>
    (getAnalytics().logEvent as jest.Mock).mock.calls.filter(
      ([event]) => event === "payment_blocked_expired_invoice",
    )

  // Firebase event params are snake_case by convention — app/utils/analytics.ts
  // turns the rule off file-wide for the same reason.
  /* eslint-disable camelcase */
  const blockedEvent = (payment_type: string, sending_wallet: WalletCurrency) => [
    "payment_blocked_expired_invoice",
    { payment_type, sending_wallet },
  ]
  /* eslint-enable camelcase */

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date, "now").mockReturnValue(MOUNTED_MS)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("refuses a payee-minted invoice that died, and names the right remedy", async () => {
    const paymentDetail = createAmountLightningPaymentDetails({
      paymentRequest: INCIDENT_INVOICE,
      paymentRequestAmount: amount,
      convertMoneyAmount,
      sendingWalletDescriptor: btcSendingWalletDescriptor,
    })

    const { getByText, queryByText, confirm } = await renderConfirmation(paymentDetail)
    await confirm()

    // A scanned or pasted bolt11 cannot be re-minted by going back: going
    // back and forward returns the same invoice, and an amount-carrying
    // invoice has no amount field at all. Telling this user to confirm again
    // would loop them forever, so they are told to get a new invoice from the
    // payee.
    expect(getByText(en.SendBitcoinDestinationScreen.expiredInvoice)).toBeTruthy()
    expect(queryByText(en.SendBitcoinConfirmationScreen.heldInvoiceExpired)).toBeNull()
    // The whole point of the guard: no doomed round trip.
    expect(payLightningBreez).not.toHaveBeenCalled()
    // ...and the refusal is countable. logPaymentAttempt deliberately does
    // not fire here, so without this event a blocked send leaves no trace at
    // all — client or server — and ENG-555 stays unanswerable.
    expect(blockedEvents()).toEqual([blockedEvent("lightning", WalletCurrency.Btc)])
    expect(getAnalytics().logEvent).not.toHaveBeenCalledWith(
      "payment_attempt",
      expect.anything(),
    )
  })

  it("refuses after an ordinary 90-second pause, which is younger than the grace", async () => {
    // The pause this guard exists to catch, and the one the absolute
    // expiry+120s comparison cannot see: 90 seconds on a 60-second invoice.
    // Before the elapsed-since-mount reading, this user still spent the
    // doomed round trip and got "Something went wrong".
    const paymentDetail = createAmountLightningPaymentDetails({
      paymentRequest: INCIDENT_INVOICE,
      paymentRequestAmount: amount,
      convertMoneyAmount,
      sendingWalletDescriptor: btcSendingWalletDescriptor,
    })

    const { getByText, confirm } = await renderConfirmation(paymentDetail)
    await confirm(AFTER_ORDINARY_PAUSE_MS)

    expect(getByText(en.SendBitcoinDestinationScreen.expiredInvoice)).toBeTruthy()
    expect(payLightningBreez).not.toHaveBeenCalled()
    expect(blockedEvents()).toHaveLength(1)
  })

  // A USD send puts the held bolt11 in the GraphQL mutation input, so the
  // guard applies — unlike the Breez BTC wallet further down.
  const usdLnurlPaymentDetail = (lnurlPayParams = lnurlParams()) => {
    const lnurlDetail = createLnurlPaymentDetails({
      lnurl: "someone@flashapp.me",
      lnurlParams: lnurlPayParams,
      paymentRequest: INCIDENT_INVOICE,
      paymentRequestAmount: amount,
      unitOfAccountAmount: amount,
      convertMoneyAmount,
      sendingWalletDescriptor: { currency: WalletCurrency.Usd, id: "testwallet" },
    })
    const sendPaymentMutation = jest.fn()
    return { paymentDetail: { ...lnurlDetail, sendPaymentMutation }, sendPaymentMutation }
  }

  it("tells an LNURL sender to go back, where a fresh invoice really is minted", async () => {
    const { paymentDetail, sendPaymentMutation } = usdLnurlPaymentDetail()

    const { getByText, queryByText, confirm } = await renderConfirmation(paymentDetail)
    await confirm(AFTER_ORDINARY_PAUSE_MS)

    expect(getByText(en.SendBitcoinConfirmationScreen.heldInvoiceExpired)).toBeTruthy()
    expect(queryByText(en.SendBitcoinDestinationScreen.expiredInvoice)).toBeNull()
    expect(sendPaymentMutation).not.toHaveBeenCalled()
    expect(blockedEvents()).toEqual([blockedEvent("lnurl", WalletCurrency.Usd)])
  })

  it("gives a fixed-amount LNURL sender a remedy they can actually follow", async () => {
    // min === max (a flashcard reload, a fixed-price merchant QR) makes the
    // amount a destination-specified one, which renders the amount input
    // disabled. "Enter the amount again" would send this user hunting for a
    // field that is not there; going back and forward re-mints on its own.
    const { paymentDetail } = usdLnurlPaymentDetail(
      createMock<LnUrlPayServiceResponse>({
        min: 100 as Satoshis,
        max: 100 as Satoshis,
      }),
    )
    expect(paymentDetail.canSetAmount).toBe(false)

    const { getByText, confirm } = await renderConfirmation(paymentDetail)
    await confirm(AFTER_ORDINARY_PAUSE_MS)

    const remedy = en.SendBitcoinConfirmationScreen.heldInvoiceExpired
    expect(getByText(remedy)).toBeTruthy()
    expect(remedy).not.toMatch(/enter the amount/i)
  })

  it("does not block a badly fast handset on a freshly minted LNURL invoice", async () => {
    // A handset more than expiry + 120s fast reads every invoice it is ever
    // shown as long dead. Refusing on that reading makes an LNURL send
    // impossible — the "fresh one" the copy promises reads expired too — for
    // a payment that works today. The elapsed reading is 0 here, exactly as
    // it is on a correct clock, so the send goes out.
    const tenMinutesFastMs = (ISSUED + 10 * 60) * 1000
    jest.spyOn(Date, "now").mockReturnValue(tenMinutesFastMs)

    const { paymentDetail, sendPaymentMutation } = usdLnurlPaymentDetail()
    sendPaymentMutation.mockResolvedValue({
      data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })

    const { queryByText, confirm } = await renderConfirmation(paymentDetail)
    await confirm(tenMinutesFastMs)

    expect(queryByText(en.SendBitcoinConfirmationScreen.heldInvoiceExpired)).toBeNull()
    expect(queryByText(en.SendBitcoinDestinationScreen.expiredInvoice)).toBeNull()
    expect(blockedEvents()).toHaveLength(0)
    expect(sendPaymentMutation).toHaveBeenCalled()
  })

  it("does not block a BTC LNURL send, which mints a fresh invoice anyway", async () => {
    // useSendPayment routes BTC + lnurl to payLnurlBreez, which re-resolves
    // the lightning address and mints at send time. The held bolt11 never
    // goes out, so refusing on its expiry would kill a payment Breez would
    // have completed — the false positive this guard must never produce.
    const paymentDetail = createLnurlPaymentDetails({
      lnurl: "someone@flashapp.me",
      lnurlParams: lnurlParams(),
      paymentRequest: INCIDENT_INVOICE,
      paymentRequestAmount: amount,
      unitOfAccountAmount: amount,
      convertMoneyAmount,
      sendingWalletDescriptor: btcSendingWalletDescriptor,
    })

    const { queryByText, navigate, confirm } = await renderConfirmation(paymentDetail)
    await confirm()

    expect(queryByText(en.SendBitcoinConfirmationScreen.heldInvoiceExpired)).toBeNull()
    expect(queryByText(en.SendBitcoinDestinationScreen.expiredInvoice)).toBeNull()
    expect(blockedEvents()).toHaveLength(0)
    expect(payLnurlBreez).toHaveBeenCalled()
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("sendBitcoinSuccess", expect.anything()),
    )
  })
})
