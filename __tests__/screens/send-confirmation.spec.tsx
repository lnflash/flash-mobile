import React, { PropsWithChildren } from "react"

import { StyleSheet, TouchableOpacity } from "react-native"
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native"
import { Intraledger } from "../../app/screens/send-bitcoin-screen/send-bitcoin-confirmation-screen.stories"
import { ContextForScreen } from "./helper"

import SendBitcoinConfirmationScreen from "@app/screens/send-bitcoin-screen/send-bitcoin-confirmation-screen"
import {
  noteInvoiceFirstSight,
  resetInvoiceFirstSight,
} from "@app/screens/send-bitcoin-screen/invoice-expiry"
import {
  createAmountLightningPaymentDetails,
  createLnurlPaymentDetails,
  createNoAmountLightningPaymentDetails,
} from "@app/screens/send-bitcoin-screen/payment-details/lightning"
import { resetSendAttemptKeys } from "@app/screens/send-bitcoin-screen/send-attempt-key"
import { ConvertMoneyAmount } from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import { BreezContext } from "@app/contexts/BreezContext"
import { WalletCurrency } from "@app/graphql/generated"
import { DisplayCurrency, toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import { light as lightColors } from "@app/rne-theme/colors"
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

// The real invoice from the ENG-555 incident: issued 1787243982, expires
// 1787244042. Its payee is the PROD Flash node (03501a…) — the same node the
// StoryScreen-pinned "Main" instance lists in lnNodePubkeys — so for the
// fee-from-amount disclosure it reads as a Flash-internal destination.
const INCIDENT_INVOICE =
  "lnbc1p4gwtwwpp5wwulk8jw0llvgjadwzuen6nxh7hgmddplj3evpgjc7n8l5kzqvmqdph2pshjgr5dusyvmrpwd5zq4mpd3kx2apq24ek2u36ypj8yetpv3kkz7qcqzzsxqzpusp5wane88x5twmdlpnu4cqrk4wd6g3tks7xgq798nt9zt68vmcnnp6q9qxpqysgqnszg0ycjk4255es2hdd3ajep3yquuvra6jn4k8shskhpzg80mrl9m9pgylahzq80aw9ekz6e47ycpcf558080xrxn6uljn54lc447rqpn9u06u"

const convertMoneyAmount: ConvertMoneyAmount = (moneyAmount, currency) => ({
  amount: moneyAmount.amount,
  currency,
  currencyCode: currency === DisplayCurrency ? "NGN" : currency,
})

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
  // INCIDENT_INVOICE's timestamps: issued 1787243982, expires 1787244042.
  const ISSUED = 1787243982
  const EXPIRES = 1787244042
  // This screen can perfectly well open on a dead invoice. parsePaymentDestination
  // only rejects a bolt11 that is already expired at paste/scan time; the
  // amount screen then holds a `lightning` detail unchanged for as long as the
  // user takes to pick a wallet and type a number (only `lnurl` re-mints, at
  // send-bitcoin-details-screen.tsx). So "alive at mount" is the common case,
  // not the only one — see "refuses an invoice that was already dead when the
  // screen opened" below.
  const MOUNTED_MS = (ISSUED + 4) * 1000
  // The scan, four seconds into the 60-second window. Standing in for the
  // amount screen's own noteInvoiceFirstSight call in the cases that need the
  // invoice to have been seen before this screen mounted.
  const SCANNED_SECONDS = ISSUED + 4
  // The user's retry from the report, ~18 minutes past expiry.
  const LONG_AFTER_EXPIRY_MS = (EXPIRES + 18 * 60) * 1000
  // An ordinary pause on the confirm screen: 90 seconds, which outlives a
  // 60-second Flash invoice but leaves it younger than expiry + the 120s
  // clock-skew grace. Only the elapsed-since-first-sight reading can see this one.
  const AFTER_ORDINARY_PAUSE_MS = MOUNTED_MS + 90 * 1000

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
    // First-sight readings are keyed by invoice in module state so they
    // survive a screen remount in production. Clear them between cases, or a
    // fixture reused across tests carries the previous test's clock in.
    resetInvoiceFirstSight()
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
    // Before the elapsed-since-first-sight reading, this user still spent the
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

  it("refuses an invoice that was already dead when the screen opened", async () => {
    // ENG-555's actual shape. The user scanned a live 60-second invoice, then
    // spent ~18 minutes on the amount screen — nothing there re-mints a
    // `lightning` detail — so this screen mounts holding a corpse and the very
    // first tap must be refused. That only works because the amount screen
    // registered first sight at the scan; seeded here in its place.
    noteInvoiceFirstSight(INCIDENT_INVOICE, SCANNED_SECONDS)
    jest.spyOn(Date, "now").mockReturnValue(LONG_AFTER_EXPIRY_MS)

    const paymentDetail = createAmountLightningPaymentDetails({
      paymentRequest: INCIDENT_INVOICE,
      paymentRequestAmount: amount,
      convertMoneyAmount,
      sendingWalletDescriptor: btcSendingWalletDescriptor,
    })

    const { getByText, confirm } = await renderConfirmation(paymentDetail)
    // No pause on this screen at all: mount and tap read the same instant.
    await confirm(LONG_AFTER_EXPIRY_MS)

    expect(getByText(en.SendBitcoinDestinationScreen.expiredInvoice)).toBeTruthy()
    expect(payLightningBreez).not.toHaveBeenCalled()
    expect(blockedEvents()).toEqual([blockedEvent("lightning", WalletCurrency.Btc)])
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

// #561 — the zero-fee celebration asserted at the rendered screen, not the
// predicate. shouldCelebrateZeroFee is unit-tested in
// __tests__/components/fee-from-amount.spec.ts, but only a render can catch
// the wiring in ConfirmationWalletFee: `fee.amount?.amount` (not the object)
// into the predicate, the ternary picking the celebration styles, the
// comparison line mounting under the row. These pin both directions — a TRUE
// zero celebrates with no caveat, and the probed zero that owes the
// fee-from-amount disclosure (#694) gets the caveat and never the green.
describe("zero-fee prominence (#561)", () => {
  // A real bolt11 minted by the Test instance (2026-08-24, long expired —
  // expiry is irrelevant here; nothing presses Send). Its payee is the Test
  // node (02004d…, IBEX_SB), NOT the "Main" node the StoryScreen test tree
  // pins — so the disclosure logic reads it as an external destination.
  // INCIDENT_INVOICE would not do: it pays Main's own node, which correctly
  // suppresses the caveat.
  const EXTERNAL_INVOICE =
    "lnbc14060n1p4gclcjpp555k59jc4xn0x3mej3gzmuj7lg66u0rtkq73vtvwqtrmd8luemprqdpvvejk2ttswfhkyefqwejhy6txd93kzarfdahzqgek8y6qcqzzsxqzpusp5rprrqnqhclwmc7au9vqf306mg6wndelar076yu6f8nr7md6kzv9q9qxpqysgqnpc09nfh90rew3z7d06pu3056nu24e809j5sj6qn0ytquu252h0sp2dkd6gc3qudwduecfvxw7m6vlt6mc0s3seqv0nvet4u9xpq6wsqfhuttw"

  it("celebrates the intraledger zero: green fee, remittance comparison, no caveat", async () => {
    const { findByLabelText, queryByLabelText } = render(
      <ContextForScreen>
        <Intraledger />
      </ContextForScreen>,
    )

    await act(async () => {})
    await act(async () => {})

    // The comparison line renders with the real copy — not just the predicate
    // returning true somewhere off-screen.
    const comparison = await findByLabelText("Zero Fee Comparison")
    expect(comparison.children).toEqual([
      en.SendBitcoinConfirmationScreen.typicalRemittanceComparison,
    ])

    // The fee itself wears the celebration styles. An inverted ternary at the
    // style prop would ship a plain row past every predicate test.
    const feeText = await findByLabelText("Successful Fee")
    expect(StyleSheet.flatten(feeText.props.style)).toMatchObject({
      color: lightColors.green,
      fontWeight: "bold",
    })

    // An intraledger zero is TRUE — the fee-from-amount caveat must stay silent.
    expect(queryByLabelText("Fee From Amount Disclosure")).toBeNull()
  })

  it("never celebrates a probed zero — the caveat renders instead", async () => {
    // The #694 shape: an external lightning send from the cash wallet whose
    // fee probe returns a set 0. The zero is not a promise, so the disclosure
    // must render and the celebration must not — green above a caveat would be
    // the app contradicting itself on a money screen.
    const usdDetail = createAmountLightningPaymentDetails({
      paymentRequest: EXTERNAL_INVOICE,
      paymentRequestAmount: toBtcMoneyAmount(100),
      convertMoneyAmount,
      sendingWalletDescriptor: { currency: WalletCurrency.Usd, id: "testwallet" },
    })
    const paymentDetail = {
      ...usdDetail,
      // Stands in for the galoy probe resolving `{ amount: 0 }` — the exact
      // response a Test-instance probe returned live (see
      // fee-from-amount.logic.ts). useFee reads this as status "set", amount 0.
      getFee: async () => ({ amount: toUsdMoneyAmount(0) }),
    }

    const route = {
      key: "sendBitcoinConfirmationScreen",
      name: "sendBitcoinConfirmation",
      params: { paymentDetail },
    } as const

    const { findByLabelText, queryByLabelText } = render(
      <ContextForScreen>
        <SendBitcoinConfirmationScreen
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          route={route as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          navigation={{ navigate: jest.fn() } as any}
        />
      </ContextForScreen>,
    )

    await act(async () => {})
    await act(async () => {})

    const disclosure = await findByLabelText("Fee From Amount Disclosure")
    expect(disclosure.children).toEqual([
      en.SendBitcoinConfirmationScreen.feeDeductedFromAmount,
    ])

    // No celebration anywhere on the screen: no comparison line, and the fee
    // row keeps the theme's plain text styling (RNEUI merges a base style, so
    // assert the celebration attributes specifically).
    expect(queryByLabelText("Zero Fee Comparison")).toBeNull()
    const feeText = await findByLabelText("Successful Fee")
    const feeStyle = StyleSheet.flatten(feeText.props.style)
    expect(feeStyle?.color).not.toBe(lightColors.green)
    expect(feeStyle?.fontWeight).not.toBe("bold")
  })
})

// ENG-533, app half — driven through the real screen, the real hook and the
// real payment-detail builder. Only the mutation boundary is a double, so the
// key the hook derives is observable and the double-send is countable.
//
// Two protections, easy to conflate and separately testable here:
//
//  - the in-flight guard stops a double TAP producing two requests;
//  - the idempotency key stops a repeated REQUEST producing two payments.
//
// The second is the dangerous one. A send whose response was lost (dropped
// socket, gateway 502, app backgrounded mid-flight) has already moved the
// money, and the client cannot tell. Only a key that survives the retry — and
// on this flow the retry is a back-navigation, which unmounts everything —
// lets the backend recognise the repeat.
describe("a repeated USD send must settle once", () => {
  // Inside INCIDENT_INVOICE's 60-second window (issued 1787243982), so the
  // ENG-555 expiry guard lets these sends through and the assertions here are
  // about idempotency and nothing else.
  const ALIVE_MS = (1787243982 + 4) * 1000

  // Small enough to sit under the 158-cent USD balance the mocked
  // SendBitcoinConfirmationScreen query returns, so Confirm is never disabled
  // for balance reasons and no case can pass vacuously.
  const amount = toBtcMoneyAmount(100)

  // The same conversion one realtime-price tick later. The details screen sits
  // mounted underneath this one and re-derives the payment detail whenever the
  // price subscription fires, so this is what the back-navigation retry hands
  // back — a settlement amount a cent away from the one that was sent.
  const priceTicked: ConvertMoneyAmount = (moneyAmount, currency) => ({
    amount: currency === DisplayCurrency ? moneyAmount.amount : moneyAmount.amount + 1,
    currency,
    currencyCode: currency === DisplayCurrency ? "NGN" : currency,
  })

  // A USD no-amount lightning send: the GraphQL branch of useSendPayment, and
  // the exact path flash#494 added the key for.
  const usdLightningDetail = (convert: ConvertMoneyAmount = convertMoneyAmount) => {
    const detail = createNoAmountLightningPaymentDetails({
      paymentRequest: INCIDENT_INVOICE,
      unitOfAccountAmount: amount,
      convertMoneyAmount: convert,
      sendingWalletDescriptor: { currency: WalletCurrency.Usd, id: "testwallet" },
    })
    const sendPaymentMutation = jest.fn()
    return { paymentDetail: { ...detail, sendPaymentMutation }, sendPaymentMutation }
  }

  const keysSent = (mutation: jest.Mock): (string | undefined)[] =>
    mutation.mock.calls.map(([params]) => params.idempotencyKey)

  const paymentResults = () =>
    (getAnalytics().logEvent as jest.Mock).mock.calls.filter(
      ([event]) => event === "payment_result",
    )

  const paymentAttempts = () =>
    (getAnalytics().logEvent as jest.Mock).mock.calls.filter(
      ([event]) => event === "payment_attempt",
    )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderScreen = async (paymentDetail: any) => {
    const navigate = jest.fn()
    const screen = render(
      <ContextForScreen>
        <SendBitcoinConfirmationScreen
          route={
            {
              key: "sendBitcoinConfirmationScreen",
              name: "sendBitcoinConfirmation",
              params: { paymentDetail },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          navigation={{ navigate } as any}
        />
      </ContextForScreen>,
    )

    await act(async () => {})
    await act(async () => {})

    const confirmButton = () => {
      const button = screen
        .UNSAFE_getAllByType(TouchableOpacity)
        .find((node) => within(node).queryByText(en.SendBitcoinConfirmationScreen.title))
      if (!button) throw new Error("Confirm button is not on screen")
      return button
    }

    const tapConfirm = () =>
      act(async () => {
        fireEvent.press(confirmButton())
      })

    // The production race, which pressing twice in sequence cannot reproduce:
    // two taps in one frame both capture the closure from the render where
    // `sendPayment` was still defined, and both run before React re-renders
    // with `hasAttemptedSend` set. Re-reading the button between them would
    // test the render gate instead of the synchronous ref that actually stops
    // the second request.
    const doubleTapInOneFrame = async () => {
      const onPress = confirmButton().props.onPress as () => Promise<void>
      let taps: Promise<void>[] = []
      await act(async () => {
        taps = [onPress(), onPress()]
        // Let the suppressed tap run to completion WITHOUT waiting on the
        // first, which is still on the wire — that overlap is the whole point.
        await Promise.resolve()
        await Promise.resolve()
      })
      return taps
    }

    return { ...screen, navigate, tapConfirm, doubleTapInOneFrame }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date, "now").mockReturnValue(ALIVE_MS)
    resetInvoiceFirstSight()
    // Keys are keyed by the attempt in module state so they survive a remount
    // in production. Clear them between cases, or one case's retired key
    // decides the next case's.
    resetSendAttemptKeys()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("lets only the first of two taps in one frame reach the server", async () => {
    const { paymentDetail, sendPaymentMutation } = usdLightningDetail()
    let release: (value: unknown) => void = () => {}
    sendPaymentMutation.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )

    const screen = await renderScreen(paymentDetail)
    const taps = await screen.doubleTapInOneFrame()

    expect(sendPaymentMutation).toHaveBeenCalledTimes(1)

    // The suppressed tap must leave no trace. Before it was distinguishable
    // from a real result it stopped the spinner while the first send was still
    // on the wire, recorded a payment_result with an undefined status into the
    // analytics ENG-533 is measured on, and showed a failure toast plus an
    // error haptic over a payment that was about to succeed.
    expect(paymentResults()).toHaveLength(0)
    expect(screen.queryByText("Something went wrong")).toBeNull()

    // ...including in the attempt count. `payment_attempt` fired before the
    // suppression was known, so a double tap recorded TWO attempts against one
    // result and skewed the attempt→result ratio ENG-533 is measured on by
    // exactly the double-taps ENG-533 counts.
    expect(paymentAttempts()).toHaveLength(1)

    await act(async () => {
      release({ status: "SUCCESS", errors: [] })
      await Promise.all(taps)
    })

    // The one send that did go out still owns the outcome. Firebase event
    // params are snake_case by convention — as elsewhere in this file.
    expect(paymentResults()).toHaveLength(1)
    expect(paymentAttempts()).toHaveLength(1)
    /* eslint-disable camelcase */
    expect(paymentResults()[0][1]).toMatchObject({ payment_status: "SUCCESS" })
    /* eslint-enable camelcase */
  })

  it("frees the button after a definitive failure, and the retry carries a NEW key", async () => {
    const { paymentDetail, sendPaymentMutation } = usdLightningDetail()
    sendPaymentMutation.mockResolvedValue({ status: "FAILURE", errors: [] })

    const screen = await renderScreen(paymentDetail)
    await screen.tapConfirm()

    expect(screen.getByText("Something went wrong")).toBeTruthy()

    await screen.tapConfirm()

    expect(sendPaymentMutation).toHaveBeenCalledTimes(2)
    const [first, second] = keysSent(sendPaymentMutation)
    // The server said nothing settled. Reusing the key would make the backend
    // replay the recorded failure and the customer could never succeed.
    expect(second).not.toBe(first)
  })

  it("stays retryable when the response is lost, and the retry carries the SAME key", async () => {
    // The case the whole design is justified by: the mutation throws, so the
    // client has no idea whether the money moved. Before this, the thrown path
    // left the screen wedged — in-flight, attempted and errored — so the
    // retained key could never be resent by anyone.
    const { paymentDetail, sendPaymentMutation } = usdLightningDetail()
    sendPaymentMutation
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({ status: "SUCCESS", errors: [] })

    const screen = await renderScreen(paymentDetail)
    await screen.tapConfirm()

    expect(screen.getByText("Network request failed")).toBeTruthy()

    await screen.tapConfirm()

    expect(sendPaymentMutation).toHaveBeenCalledTimes(2)
    // Both taps really became requests, so both are attempts. Moving
    // `logPaymentAttempt` below the awaited send — one way to stop the
    // suppressed tap counting — would lose the first one entirely, since the
    // thrown mutation never returns to that line.
    expect(paymentAttempts()).toHaveLength(2)
    const [first, second] = keysSent(sendPaymentMutation)
    expect(second).toBe(first)
    await waitFor(() =>
      expect(screen.navigate).toHaveBeenCalledWith(
        "sendBitcoinSuccess",
        expect.anything(),
      ),
    )
  })

  it("carries the same key across the back-navigation that IS the retry", async () => {
    // A key held in a ref cannot do this, and back-navigation is the only
    // retry this flow offers: it unmounts the confirm screen, so a per-mount
    // uuid is minted afresh for exactly the repeat it is supposed to make
    // recognisable, and the backend books a second payment.
    const first = usdLightningDetail()
    first.sendPaymentMutation.mockRejectedValue(new Error("Network request failed"))

    const firstScreen = await renderScreen(first.paymentDetail)
    await firstScreen.tapConfirm()
    firstScreen.unmount()

    // Back and forward: the details screen rebuilds the payment detail from
    // scratch, so nothing but the attempt itself carries over.
    const second = usdLightningDetail()
    second.sendPaymentMutation.mockResolvedValue({ status: "SUCCESS", errors: [] })

    const secondScreen = await renderScreen(second.paymentDetail)
    await secondScreen.tapConfirm()

    expect(keysSent(second.sendPaymentMutation)[0]).toBe(
      keysSent(first.sendPaymentMutation)[0],
    )
  })

  it("carries the same key when the price ticked under the back-navigation", async () => {
    // The back-navigation retry does not hand back the detail that was sent:
    // the details screen stays mounted underneath this one and rebuilds it on
    // every realtime-price tick, so a USD/USDT send comes back with a
    // settlement amount a cent away — the amount is a price-derived estimate
    // (`settlementAmountIsEstimated`), not something the user authored. Keyed
    // on it, the very retry this design exists for gets a different uuid and
    // the backend books a second payment.
    const first = usdLightningDetail()
    first.sendPaymentMutation.mockRejectedValue(new Error("Network request failed"))

    const firstScreen = await renderScreen(first.paymentDetail)
    await firstScreen.tapConfirm()
    firstScreen.unmount()

    const second = usdLightningDetail(priceTicked)
    second.sendPaymentMutation.mockResolvedValue({ status: "SUCCESS", errors: [] })

    const secondScreen = await renderScreen(second.paymentDetail)
    await secondScreen.tapConfirm()

    // The estimate really did move, so this cannot pass vacuously.
    expect(second.paymentDetail.settlementAmount.amount).not.toBe(
      first.paymentDetail.settlementAmount.amount,
    )
    expect(keysSent(second.sendPaymentMutation)[0]).toBe(
      keysSent(first.sendPaymentMutation)[0],
    )
  })

  it("mints a different key once the user changes the amount", async () => {
    // A different amount is a different payment. Sharing the key would have
    // the backend answer it with the previous send's outcome.
    const first = usdLightningDetail()
    first.sendPaymentMutation.mockRejectedValue(new Error("Network request failed"))
    const firstScreen = await renderScreen(first.paymentDetail)
    await firstScreen.tapConfirm()
    firstScreen.unmount()

    const changed = createNoAmountLightningPaymentDetails({
      paymentRequest: INCIDENT_INVOICE,
      unitOfAccountAmount: toBtcMoneyAmount(101),
      convertMoneyAmount,
      sendingWalletDescriptor: { currency: WalletCurrency.Usd, id: "testwallet" },
    })
    const sendPaymentMutation = jest.fn().mockResolvedValue({ status: "SUCCESS" })
    const secondScreen = await renderScreen({ ...changed, sendPaymentMutation })
    await secondScreen.tapConfirm()

    expect(keysSent(sendPaymentMutation)[0]).not.toBe(
      keysSent(first.sendPaymentMutation)[0],
    )
  })

  it("locks the button once the server owns the outcome", async () => {
    // The other way the reset policy can be wrong. SUCCESS, PENDING and
    // ALREADY_PAID all mean another tap would be a second payment.
    const { paymentDetail, sendPaymentMutation } = usdLightningDetail()
    sendPaymentMutation.mockResolvedValue({ status: "SUCCESS", errors: [] })

    const screen = await renderScreen(paymentDetail)
    await screen.tapConfirm()
    await screen.tapConfirm()

    expect(sendPaymentMutation).toHaveBeenCalledTimes(1)
  })
})
