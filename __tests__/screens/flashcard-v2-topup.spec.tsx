/**
 * ENG-616: the Cashu card top-up screen. The engine (cashu-card-topup) has its
 * own spec against a signing mint; this one drives the screen's steps with
 * the engine and the card taps stubbed at their edges.
 */
import * as React from "react"
import { TouchableOpacity } from "react-native"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { NfcError } from "react-native-nfc-manager"

import { CashuCardState } from "../../app/contexts/Flashcard"
import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import appTheme from "../../app/rne-theme/theme"
import {
  FlashcardV2TopUpScreen,
  topUpEligibility,
} from "../../app/screens/card-screen/flashcard-v2-topup"
import { CardError } from "../../app/utils/cashu-card"
import { TopUpError, TopUpRecord } from "../../app/utils/cashu-card-topup"

loadLocale("en")
const LL = i18nObject("en")

const PUBKEY = "02" + "ab".repeat(32)

const card = (over: Partial<CashuCardState> = {}): CashuCardState => ({
  pubkey: PUBKEY,
  version: "0.2",
  maxSlots: 32,
  unspent: 0,
  spent: 0,
  empty: 32,
  secp256k1Native: true,
  schnorr: true,
  pinState: "unset",
  balance: 0,
  keysets: [],
  ...over,
})

const record = (over: Partial<TopUpRecord> = {}): TopUpRecord => ({
  version: 1,
  id: "topup-1",
  cardPubkey: PUBKEY,
  mintUrl: "https://mint.test",
  unit: "sat",
  amount: 1000,
  keysetId: "0059534ce0bfa19a",
  quote: { id: "q", request: "lnbc", expiry: null },
  outputs: [],
  payment: {
    walletId: "cash",
    idempotencyKey: "k",
    dispatched: false,
    wentKeyless: false,
  },
  loadStarted: false,
  state: "quoted",
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

let mockCard: CashuCardState | undefined
let mockParams: { topUpId?: string } | undefined
let mockUsdEnabled = false
let mockEntered = 1000
let beforeRemove: (() => void) | undefined
const mockGoBack = jest.fn()
const mockStoreGet = jest.fn()
const mockFeeFor = jest.fn()
const mockCheckPin = jest.fn()
const mockLoad = jest.fn()
const mockPrepare = jest.fn()
const mockPay = jest.fn()
const mockMint = jest.fn()
const mockCancel = jest.fn()

jest.mock("@app/i18n/i18n-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({
    goBack: mockGoBack,
    navigate: jest.fn(),
    addListener: (event: string, handler: () => void) => {
      if (event === "beforeRemove") beforeRemove = handler
      return () => undefined
    },
  }),
  useRoute: () => ({ params: mockParams }),
}))
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)
jest.mock("@app/config/feature-flags-context", () => ({
  useFeatureFlags: () => ({ cashuCardUsdEnabled: mockUsdEnabled }),
}))
jest.mock("@app/graphql/is-authed-context", () => ({ useIsAuthed: () => true }))
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useHomeAuthedQuery: () => ({
    data: {
      me: {
        defaultAccount: {
          wallets: [{ id: "cash", walletCurrency: "USD", balance: 50_000 }],
        },
      },
    },
  }),
}))
jest.mock("@app/hooks/useFlashcard", () => ({
  useFlashcard: () => ({ cashuCard: mockCard }),
}))
jest.mock("@app/hooks/use-price-conversion", () => ({
  usePriceConversion: () => ({
    // One sat is one cent here: the screen's own arithmetic is what is tested.
    convertMoneyAmount: (amount: { amount: number }, currency: string) => ({
      amount: amount.amount,
      currency,
      currencyCode: currency,
    }),
  }),
}))
jest.mock("@app/hooks/use-display-currency", () => ({
  useDisplayCurrency: () => ({
    formatMoneyAmount: ({ moneyAmount }: { moneyAmount: { amount: number } }) =>
      `$${(moneyAmount.amount / 100).toFixed(2)}`,
  }),
}))
jest.mock("@app/hooks/use-card-top-up", () => ({
  useCardTopUp: () => ({
    deps: { store: { get: mockStoreGet } },
    feeFor: mockFeeFor,
    checkPin: mockCheckPin,
    load: mockLoad,
  }),
}))
jest.mock("@app/utils/cashu-card-topup", () => ({
  ...jest.requireActual("@app/utils/cashu-card-topup"),
  prepareTopUp: (...args: unknown[]) => mockPrepare(...args),
  payTopUp: (...args: unknown[]) => mockPay(...args),
  mintTopUp: (...args: unknown[]) => mockMint(...args),
  cancelTopUp: (...args: unknown[]) => mockCancel(...args),
}))
// The keypad modal is its own component; here one press sets the amount.
jest.mock("@app/components/amount-input", () => ({
  AmountInput: ({ setAmount }: { setAmount: (a: unknown) => void }) => (
    <TouchableOpacity
      testID="amount-input"
      onPress={() =>
        setAmount({ amount: mockEntered, currency: "BTC", currencyCode: "BTC" })
      }
    />
  ),
}))

const renderScreen = () =>
  render(
    <ThemeProvider
      theme={createTheme({
        mode: "light",
        lightColors: appTheme.lightColors,
        darkColors: appTheme.darkColors,
      })}
    >
      <FlashcardV2TopUpScreen />
    </ThemeProvider>,
  )

const press = (text: string) => fireEvent.press(screen.getByText(text))
const typePin = (digits: string) => {
  for (const d of digits) fireEvent.press(screen.getByTestId(`pin-${d}`))
}
const errorText = () => screen.getByTestId("topup-error").props.children

beforeEach(() => {
  jest.clearAllMocks()
  mockCard = card()
  mockParams = undefined
  mockUsdEnabled = false
  mockEntered = 1000
  beforeRemove = undefined
  mockFeeFor.mockResolvedValue(0)
  mockPrepare.mockResolvedValue(record())
  mockPay.mockResolvedValue({
    record: record({ state: "paid" }),
    result: { status: "paid" },
  })
  mockMint.mockResolvedValue({ record: record({ state: "minted" }), status: "minted" })
  mockLoad.mockResolvedValue(record({ state: "loaded" }))
})

describe("topUpEligibility", () => {
  it("lets an empty card choose its unit and a one-unit card top up in that unit", () => {
    expect(topUpEligibility(card())).toEqual({ ok: true, unit: "choose" })
    expect(
      topUpEligibility(
        card({
          balance: 500,
          unitTotals: { byUnit: [{ unit: "usd", amount: 500 }], unknown: 0 },
        }),
      ),
    ).toEqual({ ok: true, unit: "usd" })
  })

  it("refuses a blocked PIN, an unreadable PIN state, a mixed card and a card whose unit is not known yet", () => {
    expect(topUpEligibility(card({ pinState: "blocked" }))).toMatchObject({
      reason: "blocked",
    })
    expect(topUpEligibility(card({ pinState: "unknown" }))).toMatchObject({
      reason: "pin-unknown",
    })
    expect(
      topUpEligibility(
        card({
          balance: 900,
          unitTotals: {
            byUnit: [
              { unit: "sat", amount: 500 },
              { unit: "usd", amount: 400 },
            ],
            unknown: 0,
          },
        }),
      ),
    ).toMatchObject({ reason: "mixed" })
    expect(
      topUpEligibility(
        card({
          balance: 900,
          unitTotals: { byUnit: [{ unit: "sat", amount: 500 }], unknown: 400 },
        }),
      ),
    ).toMatchObject({ reason: "mixed" })
    expect(topUpEligibility(card({ balance: 900, unitTotals: undefined }))).toMatchObject(
      {
        reason: "unit-unknown",
      },
    )
  })
})

describe("FlashcardV2TopUpScreen", () => {
  it("refuses a blocked card before any amount is asked for", () => {
    mockCard = card({ pinState: "blocked" })
    renderScreen()
    expect(screen.getByTestId("topup-refused").props.children).toBe(
      LL.FlashcardV2.topUpCantBlocked(),
    )
    expect(screen.queryByTestId("amount-input")).toBeNull()
  })

  it("hides USD while the flag is off", () => {
    renderScreen()
    expect(screen.queryByTestId("topup-unit-usd")).toBeNull()
  })

  it("with the flag on, an empty card can take USD", () => {
    mockUsdEnabled = true
    renderScreen()
    fireEvent.press(screen.getByTestId("topup-unit-usd"))
    expect(screen.getByTestId("topup-unit-usd").props.accessibilityState).toEqual({
      selected: true,
    })
  })

  it("a card holding sats says top-ups add sats, even with the flag on", () => {
    mockUsdEnabled = true
    mockCard = card({
      balance: 500,
      unspent: 1,
      empty: 31,
      unitTotals: { byUnit: [{ unit: "sat", amount: 500 }], unknown: 0 },
    })
    renderScreen()
    expect(screen.queryByTestId("topup-unit-usd")).toBeNull()
    expect(screen.getByTestId("topup-unit-fixed").props.children).toBe(
      LL.FlashcardV2.topUpUnitFixed({ unit: LL.FlashcardV2.topUpUnitSat() }),
    )
  })

  it("will not continue with more slots than the card has", () => {
    mockCard = card({ empty: 3, spent: 1 })
    mockEntered = 1000 // six slots
    renderScreen()
    fireEvent.press(screen.getByTestId("amount-input"))
    expect(screen.getByTestId("topup-amount-problem").props.children).toBe(
      LL.FlashcardV2.topUpNoRoom({ needed: 6, free: 4 }),
    )
    press(LL.FlashcardV2.next())
    expect(mockPrepare).not.toHaveBeenCalled()
  })

  it("will not continue past the mint's limit for a single top-up", () => {
    mockEntered = 1_000_001
    renderScreen()
    fireEvent.press(screen.getByTestId("amount-input"))
    expect(screen.getByTestId("topup-amount-problem").props.children).toBe(
      LL.FlashcardV2.topUpTooMuch({ max: "1,000,000 sats" }),
    )
  })

  it("will not continue past the Cash wallet's balance", () => {
    mockEntered = 60_000
    renderScreen()
    fireEvent.press(screen.getByTestId("amount-input"))
    expect(screen.getByTestId("topup-amount-problem").props.children).toBe(
      LL.FlashcardV2.topUpMoreThanBalance(),
    )
  })

  it("no PIN: amount, confirm, pay, load, done, and says anyone holding the card can spend it", async () => {
    renderScreen()
    expect(screen.getByTestId("topup-no-pin")).toBeTruthy()
    fireEvent.press(screen.getByTestId("amount-input"))
    expect(screen.getByTestId("topup-slots").props.children).toBe(
      LL.FlashcardV2.topUpSlots({ needed: 6, free: 32 }),
    )

    await act(async () => press(LL.FlashcardV2.next()))
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cardPubkey: PUBKEY,
        unit: "sat",
        amount: 1000,
        walletId: "cash",
      }),
    )
    expect(mockCheckPin).not.toHaveBeenCalled()
    expect(screen.getByTestId("topup-confirm-amount").props.children).toBe("1,000 sats")
    expect(screen.getByTestId("topup-confirm-fee").props.children).toBe(
      LL.FlashcardV2.topUpConfirmNoFee(),
    )

    await act(async () => press(LL.FlashcardV2.topUpPay()))
    expect(mockPay).toHaveBeenCalledWith(expect.anything(), "topup-1")
    await waitFor(() => expect(screen.getByTestId("topup-tap")).toBeTruthy())

    await act(async () => press(LL.FlashcardV2.topUpLoad()))
    expect(mockLoad).toHaveBeenCalledWith(
      expect.objectContaining({ id: "topup-1" }),
      mockCard,
      undefined,
    )
    expect(screen.getByTestId("topup-done").props.children).toBe(
      LL.FlashcardV2.topUpLoaded({ amount: "1,000 sats" }),
    )
  })

  it("PIN set: the PIN is checked with a tap before anything is paid, then reused for the load", async () => {
    mockCard = card({ pinState: "set" })
    renderScreen()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    expect(mockPrepare).not.toHaveBeenCalled()

    typePin("1234")
    await act(async () => press(LL.FlashcardV2.topUpCheckPin()))
    expect(mockCheckPin).toHaveBeenCalledWith(PUBKEY, "1234")
    expect(mockPrepare).toHaveBeenCalled()

    await act(async () => press(LL.FlashcardV2.topUpPay()))
    await waitFor(() => expect(screen.getByTestId("topup-tap")).toBeTruthy())
    await act(async () => press(LL.FlashcardV2.topUpLoad()))
    expect(mockLoad).toHaveBeenCalledWith(expect.anything(), mockCard, "1234")
  })

  it("a wrong PIN at the check costs no payment and says how many tries are left", async () => {
    mockCard = card({ pinState: "set" })
    mockCheckPin.mockRejectedValueOnce(new CardError(0x63c2, "VERIFY_PIN"))
    renderScreen()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    typePin("1111")
    await act(async () => press(LL.FlashcardV2.topUpCheckPin()))

    expect(errorText()).toBe(LL.FlashcardV2.wrongPinOpen({ tries: 2 }))
    expect(mockPrepare).not.toHaveBeenCalled()
    expect(mockPay).not.toHaveBeenCalled()
  })

  it("the last wrong try ends the top-up before anything is paid", async () => {
    mockCard = card({ pinState: "set" })
    mockCheckPin.mockRejectedValueOnce(new CardError(0x6983, "VERIFY_PIN"))
    renderScreen()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    typePin("1111")
    await act(async () => press(LL.FlashcardV2.topUpCheckPin()))

    expect(screen.getByTestId("topup-refused").props.children).toBe(
      LL.FlashcardV2.cardNowOpen(),
    )
    expect(mockPrepare).not.toHaveBeenCalled()
  })

  it("a cancelled PIN tap is no error", async () => {
    mockCard = card({ pinState: "set" })
    mockCheckPin.mockRejectedValueOnce(new NfcError.UserCancel())
    renderScreen()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    typePin("1234")
    await act(async () => press(LL.FlashcardV2.topUpCheckPin()))
    expect(screen.queryByTestId("topup-error")).toBeNull()
    expect(mockPrepare).not.toHaveBeenCalled()
  })

  it("a failed payment stays on confirm with nothing left the wallet; an unknown one says to check history and retries", async () => {
    renderScreen()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))

    mockPay.mockResolvedValueOnce({ record: record(), result: { status: "failed" } })
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    expect(errorText()).toBe(LL.FlashcardV2.topUpPaymentFailed())

    const dispatched = record({ payment: { ...record().payment, dispatched: true } })
    mockPay.mockResolvedValueOnce({ record: dispatched, result: { status: "unknown" } })
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    expect(errorText()).toBe(LL.FlashcardV2.topUpPaymentUnknown())
    // A dispatched payment is retried, never cancelled from here.
    expect(screen.getByText(LL.FlashcardV2.topUpRetry())).toBeTruthy()
    expect(screen.queryByText(LL.FlashcardV2.topUpCancel())).toBeNull()
  })

  it("leaving at confirm before paying drops the quote", async () => {
    renderScreen()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    mockCancel.mockResolvedValue(undefined)

    act(() => beforeRemove?.())
    expect(mockCancel).toHaveBeenCalledWith(expect.anything(), "topup-1")
  })

  it("leaving after the payment was dispatched keeps the top-up, whose payment may still land", async () => {
    renderScreen()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    const dispatched = record({ payment: { ...record().payment, dispatched: true } })
    mockPay.mockResolvedValueOnce({ record: dispatched, result: { status: "unknown" } })
    await act(async () => press(LL.FlashcardV2.topUpPay()))

    act(() => beforeRemove?.())
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it("a payment the mint has not seen yet is left for later, with a way out", async () => {
    // Only the screen's 1.5 s poll waits run at once; every other timer is real.
    const realSetTimeout = global.setTimeout
    const timeouts = jest.spyOn(global, "setTimeout").mockImplementation(((
      callback: () => void,
      ms?: number,
    ) => {
      if (ms === 1500) {
        callback()
        return 0
      }
      return realSetTimeout(callback, ms)
    }) as typeof setTimeout)
    try {
      mockMint.mockResolvedValue({ record: record({ state: "paid" }), status: "waiting" })
      renderScreen()
      fireEvent.press(screen.getByTestId("amount-input"))
      await act(async () => press(LL.FlashcardV2.next()))
      await act(async () => press(LL.FlashcardV2.topUpPay()))

      await waitFor(() =>
        expect(screen.getByTestId("topup-working").props.children).toBe(
          LL.FlashcardV2.topUpWaiting(),
        ),
      )
      expect(mockMint).toHaveBeenCalledTimes(10)
      expect(mockLoad).not.toHaveBeenCalled()
      press(LL.FlashcardV2.topUpDone())
      expect(mockGoBack).toHaveBeenCalled()
    } finally {
      timeouts.mockRestore()
    }
  })

  it("a mint answer that fails verification loads nothing and says to contact support", async () => {
    mockMint.mockRejectedValueOnce(new TopUpError("dleq", "bad"))
    renderScreen()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    await act(async () => press(LL.FlashcardV2.topUpPay()))

    await waitFor(() =>
      expect(screen.getByTestId("topup-working").props.children).toBe(
        LL.FlashcardV2.topUpMintRefused(),
      ),
    )
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it("a card with no room at the load says so and keeps the top-up to finish later", async () => {
    mockLoad.mockRejectedValueOnce(new TopUpError("slots", "no room"))
    renderScreen()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    await waitFor(() => expect(screen.getByTestId("topup-tap")).toBeTruthy())
    await act(async () => press(LL.FlashcardV2.topUpLoad()))

    expect(errorText()).toBe(LL.FlashcardV2.topUpNoRoomOnCard())
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it("resumes a minted top-up at the load; a PIN card asks the PIN first and loads in the same tap", async () => {
    mockParams = { topUpId: "topup-1" }
    mockCard = card({ pinState: "set" })
    mockStoreGet.mockResolvedValue(record({ state: "minted" }))
    renderScreen()

    await waitFor(() =>
      expect(screen.getByText(LL.FlashcardV2.topUpPinTitle())).toBeTruthy(),
    )
    typePin("2468")
    await act(async () => press(LL.FlashcardV2.topUpLoad()))
    expect(mockCheckPin).not.toHaveBeenCalled()
    expect(mockLoad).toHaveBeenCalledWith(
      expect.objectContaining({ state: "minted" }),
      mockCard,
      "2468",
    )
    expect(screen.getByTestId("topup-done")).toBeTruthy()
  })

  it("resumes a dispatched quote at confirm, saying the payment could not be confirmed", async () => {
    mockParams = { topUpId: "topup-1" }
    mockStoreGet.mockResolvedValue(
      record({ payment: { ...record().payment, dispatched: true } }),
    )
    renderScreen()

    await waitFor(() => expect(screen.getByTestId("topup-confirm-amount")).toBeTruthy())
    expect(errorText()).toBe(LL.FlashcardV2.topUpPaymentUnknown())
    expect(mockPay).not.toHaveBeenCalled()
  })
})
