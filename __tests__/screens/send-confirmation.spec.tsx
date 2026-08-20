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
  const EXPIRES = 1787244042
  // The user's retry from the report, ~18 minutes past expiry — well beyond
  // the clock-skew grace, so this is a genuinely dead invoice.
  const LONG_AFTER_EXPIRY_MS = (EXPIRES + 18 * 60) * 1000

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

    const confirm = () =>
      act(async () => {
        fireEvent.press(screen.getByText(en.SendBitcoinConfirmationScreen.title))
      })

    return { ...screen, navigate, confirm }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date, "now").mockReturnValue(LONG_AFTER_EXPIRY_MS)
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

    // A scanned or pasted bolt11 cannot be re-minted by going back: setAmount
    // returns the same invoice, and an amount-carrying invoice has no amount
    // field at all. Telling this user to re-enter the amount would loop them
    // forever, so they are told to get a new invoice from the payee.
    expect(getByText(en.SendBitcoinDestinationScreen.expiredInvoice)).toBeTruthy()
    expect(queryByText(en.SendBitcoinConfirmationScreen.invoiceExpired)).toBeNull()
    // The whole point of the guard: no doomed round trip.
    expect(payLightningBreez).not.toHaveBeenCalled()
  })

  it("tells an LNURL sender to go back, where a fresh invoice really is minted", async () => {
    const lnurlDetail = createLnurlPaymentDetails({
      lnurl: "someone@flashapp.me",
      lnurlParams: lnurlParams(),
      paymentRequest: INCIDENT_INVOICE,
      paymentRequestAmount: amount,
      unitOfAccountAmount: amount,
      convertMoneyAmount,
      // A USD send puts the held bolt11 in the GraphQL mutation input, so the
      // guard applies here — unlike the Breez BTC wallet below.
      sendingWalletDescriptor: { currency: WalletCurrency.Usd, id: "testwallet" },
    })
    const sendPaymentMutation = jest.fn()
    const paymentDetail = { ...lnurlDetail, sendPaymentMutation }

    const { getByText, queryByText, confirm } = await renderConfirmation(paymentDetail)
    await confirm()

    expect(getByText(en.SendBitcoinConfirmationScreen.invoiceExpired)).toBeTruthy()
    expect(queryByText(en.SendBitcoinDestinationScreen.expiredInvoice)).toBeNull()
    expect(sendPaymentMutation).not.toHaveBeenCalled()
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

    expect(queryByText(en.SendBitcoinConfirmationScreen.invoiceExpired)).toBeNull()
    expect(queryByText(en.SendBitcoinDestinationScreen.expiredInvoice)).toBeNull()
    expect(payLnurlBreez).toHaveBeenCalled()
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("sendBitcoinSuccess", expect.anything()),
    )
  })
})
