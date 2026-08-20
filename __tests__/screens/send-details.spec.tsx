import React, { PropsWithChildren } from "react"

import { act, render, waitFor } from "@testing-library/react-native"
import { ContextForScreen } from "./helper"

import { Intraledger } from "../../app/screens/send-bitcoin-screen/send-bitcoin-details-screen.stories"
import SendBitcoinDetailsScreen from "@app/screens/send-bitcoin-screen/send-bitcoin-details-screen"
import * as invoiceExpiry from "@app/screens/send-bitcoin-screen/invoice-expiry"
import { createAmountLightningPaymentDetails } from "@app/screens/send-bitcoin-screen/payment-details/lightning"
import {
  DestinationDirection,
  PaymentDestination,
} from "@app/screens/send-bitcoin-screen/payment-destination/index.types"
import { PersistentStateContext } from "@app/store/persistent-state"
import { WalletCurrency } from "@app/graphql/generated"
import { toBtcMoneyAmount } from "@app/types/amounts"

it("SendScreen Details", async () => {
  render(
    <ContextForScreen>
      <Intraledger />
    </ContextForScreen>,
  )
  await act(async () => {})
})

// ENG-555. The clock on a held bolt11 starts at parse time (see
// __tests__/payment-destination/lightning.spec.ts); this screen keeps a
// backstop reading for anything holding an invoice that arrived another way.
// Nothing here re-mints a `lightning` detail, the user's time choosing a wallet
// and typing an amount is unbounded, and a Flash receive invoice dies after 60
// seconds — so if the clock only started on the confirm screen, that whole
// pause would be invisible: confirm's first reading is its own mount, elapsed
// is 0 by construction, and the corpse is waved through to the backend.
describe("first sight of a held invoice", () => {
  // The real invoice from the incident: issued 1787243982, expires 1787244042.
  const INCIDENT_INVOICE =
    "lnbc1p4gwtwwpp5wwulk8jw0llvgjadwzuen6nxh7hgmddplj3evpgjc7n8l5kzqvmqdph2pshjgr5dusyvmrpwd5zq4mpd3kx2apq24ek2u36ypj8yetpv3kkz7qcqzzsxqzpusp5wane88x5twmdlpnu4cqrk4wd6g3tks7xgq798nt9zt68vmcnnp6q9qxpqysgqnszg0ycjk4255es2hdd3ajep3yquuvra6jn4k8shskhpzg80mrl9m9pgylahzq80aw9ekz6e47ycpcf558080xrxn6uljn54lc447rqpn9u06u"
  const ISSUED = 1787243982
  // The scan lands 4 seconds into the 60-second window, while the invoice is
  // unambiguously alive — parsePaymentDestination would have rejected it
  // otherwise.
  const SCANNED_SECONDS = ISSUED + 4

  // The screen only builds its payment detail once it has a default wallet;
  // the storybook wrapper's persistent state has none, so supply one closer to
  // the screen than that wrapper is.
  const WithDefaultWallet: React.FC<PropsWithChildren> = ({ children }) => (
    <PersistentStateContext.Provider
      value={
        {
          persistentState: {
            schemaVersion: 7,
            galoyInstance: { id: "Main" },
            galoyAuthToken: "",
            hasInitializedBreezSDK: false,
            unclaimedDeposits: 0,
            closedQuickStartTypes: [],
            defaultWallet: {
              id: "testwallet",
              walletCurrency: WalletCurrency.Usd,
              balance: 100_000,
            },
          },
          updateState: () => {},
          resetState: () => {},
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
      }
    >
      {children}
    </PersistentStateContext.Provider>
  )

  const paymentDestination = {
    valid: true,
    destinationDirection: DestinationDirection.Send,
    validDestination: { valid: true, paymentType: "lightning" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createPaymentDetail: ({ convertMoneyAmount, sendingWalletDescriptor }: any) =>
      createAmountLightningPaymentDetails({
        paymentRequest: INCIDENT_INVOICE,
        paymentRequestAmount: toBtcMoneyAmount(100),
        convertMoneyAmount,
        sendingWalletDescriptor,
      }),
  } as unknown as PaymentDestination

  beforeEach(invoiceExpiry.resetInvoiceFirstSight)

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("starts the expiry clock when the amount screen shows the invoice", async () => {
    jest.spyOn(Date, "now").mockReturnValue(SCANNED_SECONDS * 1000)
    // Spied rather than probed: reading the recorded sighting back would mean
    // calling noteInvoiceFirstSight, which registers one if none exists — so a
    // probe cannot tell "the screen recorded it" from "the probe just did".
    // The real implementation is left in place; only the call is observed.
    const noteFirstSight = jest.spyOn(invoiceExpiry, "noteInvoiceFirstSight")

    render(
      <ContextForScreen>
        <WithDefaultWallet>
          <SendBitcoinDetailsScreen
            route={
              {
                key: "sendBitcoinDetailsScreen",
                name: "sendBitcoinDetails",
                params: { paymentDestination },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            navigation={{ navigate: jest.fn() } as any}
          />
        </WithDefaultWallet>
      </ContextForScreen>,
    )

    // The screen renders nothing until its GraphQL queries settle and it can
    // build a payment detail, so wait for the registration rather than
    // guessing at a number of ticks.
    await waitFor(() =>
      expect(noteFirstSight).toHaveBeenCalledWith(INCIDENT_INVOICE, SCANNED_SECONDS),
    )

    // And the reading that lands is the scan, not some later moment: the
    // confirm screen's own identical call has to be the no-op, or the elapsed
    // duration collapses to zero there and ENG-555's exact symptom survives.
    expect(
      invoiceExpiry.noteInvoiceFirstSight(INCIDENT_INVOICE, SCANNED_SECONDS + 120),
    ).toBe(SCANNED_SECONDS)
  })
})
