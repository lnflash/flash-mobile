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
import { CardError, CardProofSlot } from "../../app/utils/cashu-card"
import { ReclaimResult, TopUpError, TopUpRecord } from "../../app/utils/cashu-card-topup"

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
  quote: {
    id: "q",
    request: "lnbc",
    expiry: null,
    requestedAt: 1,
    quotedAt: 1,
    lifeMs: null,
  },
  outputs: [],
  payment: {
    walletId: "cash",
    idempotencyKey: "k",
    dispatched: false,
    everDispatched: false,
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
const mockStoreList = jest.fn()
const mockNudge = jest.fn()
const mockFeeFor = jest.fn()
const mockCheckPin = jest.fn()
const mockLoad = jest.fn()
const mockReclaimPlanFor = jest.fn()
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
    deps: { store: { get: mockStoreGet, list: mockStoreList } },
    feeFor: mockFeeFor,
    checkPin: mockCheckPin,
    load: mockLoad,
    reclaimPlanFor: mockReclaimPlanFor,
  }),
  nudgeTopUpMinter: () => mockNudge(),
}))
jest.mock("@app/utils/cashu-card-topup", () => ({
  ...jest.requireActual("@app/utils/cashu-card-topup"),
  prepareTopUp: (...args: unknown[]) => mockPrepare(...args),
  payTopUp: (...args: unknown[]) => mockPay(...args),
  mintTopUp: (...args: unknown[]) => mockMint(...args),
  cancelTopUp: (...args: unknown[]) => mockCancel(...args),
}))
// The keypad modal is its own component; here one press sets the amount.
type MockAmountInputProps = {
  setAmount: (a: unknown) => void
  initiallyOpen?: boolean
  walletCurrency?: string
  balanceWalletCurrency?: string
}
let mockAmountInputProps: MockAmountInputProps | undefined
// AmountInput reads initiallyOpen once, as it mounts: what each mount read,
// and what every render passed.
let mockAmountInputMounts: (boolean | undefined)[] = []
let mockInitiallyOpenSeen: (boolean | undefined)[] = []
jest.mock("@app/components/amount-input", () => ({
  AmountInput: (props: MockAmountInputProps) => {
    mockAmountInputProps = props
    mockInitiallyOpenSeen.push(props.initiallyOpen)
    React.useState(() => mockAmountInputMounts.push(props.initiallyOpen))
    return (
      <TouchableOpacity
        testID="amount-input"
        onPress={() =>
          props.setAmount({ amount: mockEntered, currency: "BTC", currencyCode: "BTC" })
        }
      />
    )
  },
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
// The screen reads the card's unfinished top-ups as it mounts, and shows the
// amount field once that read settles. A test that awaits nothing else lets
// the read settle first, inside act().
const renderSettled = async () => {
  renderScreen()
  await act(async () => undefined)
}

const press = (text: string) => fireEvent.press(screen.getByText(text))
const outputs = (count: number) =>
  Array.from({ length: count }, () => ({ amount: 1, secret: "", r: "", B_: "" }))
const typePin = (digits: string) => {
  for (const d of digits) fireEvent.press(screen.getByTestId(`pin-${d}`))
}
const errorText = () => screen.getByTestId("topup-error").props.children
/** What a load tap's reclaim found on a card with no spent slots. */
const NO_RECLAIM: ReclaimResult = { reclaimable: 0, settling: 0, cleared: 0, spent: 0 }
/** `count` spent slots, as the last tap read them. */
const spentSlots = (count: number): CardProofSlot[] =>
  Array.from({ length: count }, (_, i) => ({
    slot: i,
    status: "spent",
    keysetId: "0059534ce0bfa19a",
    amount: 1,
    nonce: (i + 1).toString(16).padStart(64, "0"),
    C: "02" + "ab".repeat(32),
  }))

beforeEach(() => {
  jest.clearAllMocks()
  mockAmountInputProps = undefined
  mockAmountInputMounts = []
  mockInitiallyOpenSeen = []
  mockCard = card()
  mockParams = undefined
  mockUsdEnabled = false
  mockEntered = 1000
  beforeRemove = undefined
  mockStoreList.mockResolvedValue([])
  mockFeeFor.mockResolvedValue(0)
  mockPrepare.mockResolvedValue(record())
  mockPay.mockResolvedValue({
    record: record({ state: "paid" }),
    result: { status: "paid" },
  })
  mockMint.mockResolvedValue({ record: record({ state: "minted" }), status: "minted" })
  mockLoad.mockResolvedValue({ record: record({ state: "loaded" }), reclaim: NO_RECLAIM })
  mockReclaimPlanFor.mockResolvedValue({ reclaimable: 0, settling: 0 })
})

describe("topUpEligibility", () => {
  const holding = (unit: "sat" | "usd") =>
    card({ balance: 500, unitTotals: { byUnit: [{ unit, amount: 500 }], unknown: 0 } })
  const usdOn = { usdEnabled: true }
  const usdOff = { usdEnabled: false }

  it("lets an empty card choose its unit and a one-unit card top up in that unit", () => {
    expect(topUpEligibility(card(), usdOn)).toEqual({ ok: true, unit: "choose" })
    expect(topUpEligibility(holding("usd"), usdOn)).toEqual({ ok: true, unit: "usd" })
    expect(topUpEligibility(card(), { ...usdOn, unfinishedUnits: ["usd"] })).toEqual({
      ok: true,
      unit: "usd",
      committed: true,
    })
  })

  it("with the USD flag off, a card set to USD takes no new top-up, by its value or by an unfinished top-up", () => {
    expect(topUpEligibility(holding("usd"), usdOff)).toEqual({
      ok: false,
      reason: "usd-off",
    })
    expect(topUpEligibility(card(), { ...usdOff, unfinishedUnits: ["usd"] })).toEqual({
      ok: false,
      reason: "usd-off-unfinished",
    })
    // Sats are untouched, and an empty card still chooses (the screen offers sats only).
    expect(topUpEligibility(holding("sat"), usdOff)).toEqual({ ok: true, unit: "sat" })
    expect(topUpEligibility(card(), usdOff)).toEqual({ ok: true, unit: "choose" })
  })

  it("refuses a blocked PIN, an unreadable PIN state, a mixed card and a card whose unit is not known yet", () => {
    expect(topUpEligibility(card({ pinState: "blocked" }), usdOn)).toMatchObject({
      reason: "blocked",
    })
    expect(topUpEligibility(card({ pinState: "unknown" }), usdOn)).toMatchObject({
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
        usdOn,
      ),
    ).toMatchObject({ reason: "mixed" })
    expect(
      topUpEligibility(
        card({
          balance: 900,
          unitTotals: { byUnit: [{ unit: "sat", amount: 500 }], unknown: 400 },
        }),
        usdOn,
      ),
    ).toMatchObject({ reason: "mixed" })
    expect(
      topUpEligibility(card({ balance: 900, unitTotals: undefined }), usdOn),
    ).toMatchObject({
      reason: "unit-unknown",
    })
  })
})

describe("FlashcardV2TopUpScreen", () => {
  it("refuses a blocked card before any amount is asked for", async () => {
    mockCard = card({ pinState: "blocked" })
    await renderSettled()
    expect(screen.getByTestId("topup-refused").props.children).toBe(
      LL.FlashcardV2.topUpCantBlocked(),
    )
    expect(screen.queryByTestId("amount-input")).toBeNull()
  })

  it("opens the keypad once the card's unfinished top-ups are read: a top-up's first job is its amount", async () => {
    renderScreen()
    // Not before: an unfinished top-up can refuse this one, or fix its unit.
    expect(screen.queryByTestId("amount-input")).toBeNull()
    await waitFor(() => expect(mockAmountInputMounts).toEqual([true]))
  })

  it("opens the keypad when the saved top-ups cannot be read: the quote refuses then", async () => {
    mockStoreList.mockRejectedValue(new Error("User interaction is not allowed"))
    renderScreen()
    await waitFor(() => expect(mockAmountInputMounts).toEqual([true]))
  })

  it("never opens the keypad for a top-up an unfinished one refuses", async () => {
    // Flag off: an unfinished USD top-up refuses a new one on an empty card.
    mockStoreList.mockResolvedValue([
      record({ unit: "usd", payment: { ...record().payment, dispatched: true } }),
    ])
    renderScreen()
    await waitFor(() =>
      expect(screen.getByTestId("topup-refused").props.children).toBe(
        LL.FlashcardV2.topUpCantUsdUnfinished(),
      ),
    )
    await act(async () => undefined)
    // A keypad presented and then taken down at once can strand the modal on iOS.
    expect(mockInitiallyOpenSeen).not.toContain(true)
    // The refusal lands with the read: no field ever mounts.
    expect(mockAmountInputMounts).toEqual([])
  })

  it("opens the keypad once an unfinished top-up fixes an empty card's unit", async () => {
    mockUsdEnabled = true
    mockStoreList.mockResolvedValue([
      record({ unit: "usd", payment: { ...record().payment, dispatched: true } }),
    ])
    renderScreen()
    await waitFor(() => expect(screen.getByTestId("topup-unit-fixed")).toBeTruthy())
    expect(screen.queryByTestId("topup-unit-sat")).toBeNull()
    await waitFor(() => expect(mockAmountInputMounts).toEqual([true]))
  })

  it("leaves the keypad shut on a card that offers a unit choice", async () => {
    mockUsdEnabled = true
    renderScreen()
    expect(screen.getByTestId("topup-unit-usd")).toBeTruthy()
    // Shut once the read finds nothing that fixes the unit, and mounted once.
    await act(async () => undefined)
    expect(mockAmountInputMounts).toEqual([false])
  })

  it("opens the keypad on a card whose value fixes its unit, even with USD on", async () => {
    mockUsdEnabled = true
    mockCard = card({
      balance: 500,
      unspent: 1,
      empty: 31,
      unitTotals: { byUnit: [{ unit: "sat", amount: 500 }], unknown: 0 },
    })
    renderScreen()
    await waitFor(() => expect(mockAmountInputMounts).toEqual([true]))
  })

  it("keeps the keypad shut once an amount is entered, also when a failed quote brings the field back", async () => {
    mockCard = card({ pinState: "set" })
    renderScreen()
    await waitFor(() => expect(mockAmountInputProps?.initiallyOpen).toBe(true))
    fireEvent.press(screen.getByTestId("amount-input"))
    expect(mockAmountInputProps?.initiallyOpen).toBe(false)
    // Entering it does not mount the field again, which would take an open keypad down.
    expect(mockAmountInputMounts).toEqual([true])

    // The PIN step takes the field away; a quote that fails brings it back, shut.
    await act(async () => press(LL.FlashcardV2.next()))
    mockPrepare.mockRejectedValueOnce(new Error("Network request failed"))
    typePin("1234")
    await act(async () => press(LL.FlashcardV2.topUpCheckPin()))
    expect(errorText()).toBe(LL.FlashcardV2.topUpPrepareFailed())
    expect(mockAmountInputMounts).toEqual([true, false])
  })

  it("there is no field to tap before the read settles, and the field mounts once after it", async () => {
    // The read waits its turn behind the store's other work: hold it there.
    let settle: ((records: TopUpRecord[]) => void) | undefined
    mockStoreList.mockReturnValue(
      new Promise<TopUpRecord[]>((resolve) => {
        settle = resolve
      }),
    )
    renderScreen()
    // A keypad opened from a field shown now would be taken down by the read.
    expect(screen.queryByTestId("amount-input")).toBeNull()
    expect(mockAmountInputMounts).toEqual([])

    await act(async () => settle?.([]))
    expect(mockAmountInputMounts).toEqual([true])
  })

  it("heads the keypad with the Cash wallet's balance: a top-up in sats is paid from it", async () => {
    await renderSettled()
    expect(mockAmountInputProps?.walletCurrency).toBe("BTC")
    expect(mockAmountInputProps?.balanceWalletCurrency).toBe("USD")
  })

  it("hides USD while the flag is off", async () => {
    await renderSettled()
    expect(screen.queryByTestId("topup-unit-usd")).toBeNull()
  })

  it("with the flag off, a card holding USD takes no new top-up, and says why", async () => {
    mockCard = card({
      balance: 500,
      unspent: 1,
      empty: 31,
      unitTotals: { byUnit: [{ unit: "usd", amount: 500 }], unknown: 0 },
    })
    await renderSettled()
    expect(screen.getByTestId("topup-refused").props.children).toBe(
      LL.FlashcardV2.topUpCantUsd(),
    )
    expect(screen.queryByTestId("amount-input")).toBeNull()
  })

  it("with the flag off, an empty card with an unfinished USD top-up takes no new one, and says to finish that one", async () => {
    mockStoreList.mockResolvedValue([
      record({ unit: "usd", payment: { ...record().payment, dispatched: true } }),
    ])
    renderScreen()

    await waitFor(() =>
      expect(screen.getByTestId("topup-refused").props.children).toBe(
        LL.FlashcardV2.topUpCantUsdUnfinished(),
      ),
    )
    expect(screen.queryByTestId("amount-input")).toBeNull()
    expect(mockPrepare).not.toHaveBeenCalled()
  })

  it("with the flag off, an unfinished USD top-up is still finished", async () => {
    mockParams = { topUpId: "topup-1" }
    mockCard = card({
      balance: 500,
      unspent: 1,
      empty: 31,
      unitTotals: { byUnit: [{ unit: "usd", amount: 500 }], unknown: 0 },
    })
    mockStoreGet.mockResolvedValue(record({ unit: "usd", state: "minted" }))
    renderScreen()

    await waitFor(() => expect(screen.getByTestId("topup-tap")).toBeTruthy())
    await act(async () => press(LL.FlashcardV2.topUpLoad()))
    expect(mockLoad).toHaveBeenCalledWith(
      expect.objectContaining({ unit: "usd", state: "minted" }),
      mockCard,
      undefined,
    )
    expect(screen.getByTestId("topup-done")).toBeTruthy()
  })

  it("with the flag on, an empty card can take USD", async () => {
    mockUsdEnabled = true
    await renderSettled()
    fireEvent.press(screen.getByTestId("topup-unit-usd"))
    expect(screen.getByTestId("topup-unit-usd").props.accessibilityState).toEqual({
      selected: true,
    })
  })

  it("a card holding sats says top-ups add sats, even with the flag on", async () => {
    mockUsdEnabled = true
    mockCard = card({
      balance: 500,
      unspent: 1,
      empty: 31,
      unitTotals: { byUnit: [{ unit: "sat", amount: 500 }], unknown: 0 },
    })
    await renderSettled()
    expect(screen.queryByTestId("topup-unit-usd")).toBeNull()
    expect(screen.getByTestId("topup-unit-fixed").props.children).toBe(
      LL.FlashcardV2.topUpUnitFixed({ unit: LL.FlashcardV2.topUpUnitSat() }),
    )
  })

  it("will not continue with more slots than the card has empty: spent slots the mint has not settled are not room", async () => {
    mockCard = card({ empty: 5, spent: 20, spentSlots: spentSlots(20) })
    // One of the twenty is still owed at the mint: none can be freed.
    mockReclaimPlanFor.mockResolvedValue({ reclaimable: 0, settling: 1 })
    mockEntered = 1000 // six slots
    await renderSettled()
    expect(mockReclaimPlanFor).toHaveBeenCalledWith(mockCard)
    fireEvent.press(screen.getByTestId("amount-input"))
    expect(screen.getByTestId("topup-amount-problem").props.children).toBe(
      LL.FlashcardV2.topUpNoRoom({ needed: 6, free: 5 }),
    )
    press(LL.FlashcardV2.next())
    expect(mockPrepare).not.toHaveBeenCalled()
  })

  it("counts the slots an unfinished top-up of this card will take as taken", async () => {
    mockCard = card({ empty: 12 })
    mockStoreList.mockResolvedValue([
      record({ id: "other", state: "minted", outputs: outputs(10) }),
      // Another card's, and a quote never sent: neither holds this card.
      record({
        id: "b",
        cardPubkey: "03" + "cd".repeat(32),
        state: "minted",
        outputs: outputs(10),
      }),
      record({ id: "c", outputs: outputs(10) }),
    ])
    renderScreen()

    await waitFor(() =>
      expect(screen.getByTestId("topup-slots-reserved").props.children).toBe(
        LL.FlashcardV2.topUpSlotsReserved({ reserved: 10 }),
      ),
    )
    fireEvent.press(screen.getByTestId("amount-input"))
    expect(screen.getByTestId("topup-amount-problem").props.children).toBe(
      LL.FlashcardV2.topUpNoRoom({ needed: 6, free: 2 }),
    )
  })

  it("a card holding sats with an unfinished USD top-up takes no top-up at all", async () => {
    mockUsdEnabled = true
    mockCard = card({
      balance: 500,
      unspent: 1,
      empty: 31,
      unitTotals: { byUnit: [{ unit: "sat", amount: 500 }], unknown: 0 },
    })
    mockStoreList.mockResolvedValue([record({ unit: "usd", state: "minted" })])
    renderScreen()

    await waitFor(() =>
      expect(screen.getByTestId("topup-refused").props.children).toBe(
        LL.FlashcardV2.topUpCantUnfinishedUnit(),
      ),
    )
    expect(screen.queryByTestId("amount-input")).toBeNull()
  })

  it("an empty card with an unfinished USD top-up tops up in USD only, and says why", async () => {
    mockUsdEnabled = true
    mockStoreList.mockResolvedValue([
      record({ unit: "usd", payment: { ...record().payment, dispatched: true } }),
    ])
    renderScreen()

    await waitFor(() =>
      expect(screen.getByTestId("topup-unit-fixed").props.children).toBe(
        LL.FlashcardV2.topUpUnitCommitted({ unit: LL.FlashcardV2.topUpUnitUsd() }),
      ),
    )
    expect(screen.queryByTestId("topup-unit-sat")).toBeNull()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        unit: "usd",
        card: { empty: 32, reclaimable: 0, unit: undefined },
      }),
    )
  })

  it("a top-up the mint could not prepare says nothing was paid, and stays on the amount", async () => {
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    mockPrepare.mockRejectedValueOnce(new Error("Network request failed"))
    await act(async () => press(LL.FlashcardV2.next()))
    expect(errorText()).toBe(LL.FlashcardV2.topUpPrepareFailed())

    mockPrepare.mockRejectedValueOnce(new TopUpError("quote", "wrong quote"))
    await act(async () => press(LL.FlashcardV2.next()))
    expect(errorText()).toBe(LL.FlashcardV2.topUpPrepareFailed())

    mockPrepare.mockRejectedValueOnce(new TopUpError("unit", "usd pending"))
    await act(async () => press(LL.FlashcardV2.next()))
    expect(errorText()).toBe(LL.FlashcardV2.topUpCantUnfinishedUnit())
    expect(screen.getByTestId("amount-input")).toBeTruthy()
  })

  it("will not continue past the mint's limit for a single top-up", async () => {
    mockEntered = 1_000_001
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    expect(screen.getByTestId("topup-amount-problem").props.children).toBe(
      LL.FlashcardV2.topUpTooMuch({ max: "1,000,000 sats" }),
    )
  })

  it("will not continue past the Cash wallet's balance", async () => {
    mockEntered = 60_000
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    expect(screen.getByTestId("topup-amount-problem").props.children).toBe(
      LL.FlashcardV2.topUpMoreThanBalance(),
    )
  })

  it("no PIN: amount, confirm, pay, load, done, and says anyone holding the card can spend it", async () => {
    await renderSettled()
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
    await renderSettled()
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
    await renderSettled()
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
    await renderSettled()
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
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    typePin("1234")
    await act(async () => press(LL.FlashcardV2.topUpCheckPin()))
    expect(screen.queryByTestId("topup-error")).toBeNull()
    expect(mockPrepare).not.toHaveBeenCalled()
  })

  it("a failed payment stays on confirm with nothing left the wallet; an unknown one says to check history and retries", async () => {
    await renderSettled()
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
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    mockCancel.mockResolvedValue(undefined)

    act(() => beforeRemove?.())
    expect(mockCancel).toHaveBeenCalledWith(expect.anything(), "topup-1")
  })

  it("leaving after the payment was dispatched keeps the top-up, whose payment may still land", async () => {
    await renderSettled()
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
      await renderSettled()
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
      // The app keeps asking the mint once this screen stops.
      expect(mockNudge).toHaveBeenCalled()
      press(LL.FlashcardV2.topUpDone())
      expect(mockGoBack).toHaveBeenCalled()
    } finally {
      timeouts.mockRestore()
    }
  })

  it("a mint answer that fails verification loads nothing and says to contact support", async () => {
    mockMint.mockRejectedValueOnce(new TopUpError("dleq", "bad"))
    await renderSettled()
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
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    await waitFor(() => expect(screen.getByTestId("topup-tap")).toBeTruthy())
    await act(async () => press(LL.FlashcardV2.topUpLoad()))

    expect(errorText()).toBe(LL.FlashcardV2.topUpNoRoomOnCard())
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it("a resumed load the mint cannot be asked about says so, and never sends the user tapping for a card", async () => {
    mockParams = { topUpId: "topup-1" }
    mockStoreGet.mockResolvedValue(record({ state: "minted", loadStarted: true }))
    // The hook asks the mint (NUT-07) before the tap: offline, it never taps.
    mockLoad.mockRejectedValueOnce(
      new TopUpError("mint-unreachable", "Network request failed"),
    )
    renderScreen()
    await waitFor(() => expect(screen.getByTestId("topup-tap")).toBeTruthy())

    await act(async () => press(LL.FlashcardV2.topUpLoad()))

    expect(errorText()).toBe(LL.FlashcardV2.topUpMintUnreachable())
    expect(errorText()).not.toBe(LL.FlashcardV2.cardNotFound())
    // Still on the load, to try again.
    expect(screen.getByTestId("topup-tap")).toBeTruthy()
  })

  it("any other refusal of the load by the engine is not read as no card found either", async () => {
    mockParams = { topUpId: "topup-1" }
    mockStoreGet.mockResolvedValue(record({ state: "minted", loadStarted: true }))
    renderScreen()
    await waitFor(() => expect(screen.getByTestId("topup-tap")).toBeTruthy())

    mockLoad.mockRejectedValueOnce(
      new TopUpError("state", "the mint's word on a proof is missing"),
    )
    await act(async () => press(LL.FlashcardV2.topUpLoad()))
    expect(errorText()).toBe(LL.FlashcardV2.topUpFailed())

    mockLoad.mockRejectedValueOnce(new TopUpError("not-found", "gone"))
    await act(async () => press(LL.FlashcardV2.topUpLoad()))
    expect(errorText()).toBe(LL.FlashcardV2.topUpGone())
  })

  it("a top-up gone from this phone while the mint is asked says so, and not that it is saved", async () => {
    mockMint.mockRejectedValueOnce(
      new TopUpError("not-found", "top-up topup-1 is not saved"),
    )
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    await act(async () => press(LL.FlashcardV2.topUpPay()))

    await waitFor(() =>
      expect(screen.getByTestId("topup-working").props.children).toBe(
        LL.FlashcardV2.topUpGone(),
      ),
    )
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

  it("an unknown payment wakes the app's watch on the mint; a refused one does not", async () => {
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))

    mockPay.mockResolvedValueOnce({ record: record(), result: { status: "failed" } })
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    expect(mockNudge).not.toHaveBeenCalled()

    const dispatched = record({
      payment: { ...record().payment, dispatched: true, everDispatched: true },
    })
    mockPay.mockResolvedValueOnce({ record: dispatched, result: { status: "unknown" } })
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    expect(mockNudge).toHaveBeenCalledTimes(1)
  })

  it("leaving after a refused payment keeps the top-up: only the mint can let it go", async () => {
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    const refused = record({
      payment: { ...record().payment, dispatched: false, everDispatched: true },
    })
    mockPay.mockResolvedValueOnce({ record: refused, result: { status: "failed" } })
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    expect(errorText()).toBe(LL.FlashcardV2.topUpPaymentFailed())
    expect(screen.getByText(LL.FlashcardV2.topUpCancel())).toBeTruthy()

    act(() => beforeRemove?.())
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it("leaving while the mint prepares the quote drops it once it arrives", async () => {
    let arrive: ((value: TopUpRecord) => void) | undefined
    mockPrepare.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          arrive = resolve
        }),
    )
    mockCancel.mockResolvedValue(undefined)
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    press(LL.FlashcardV2.next())

    act(() => beforeRemove?.())
    await act(async () => arrive?.(record()))

    expect(mockCancel).toHaveBeenCalledWith(expect.anything(), "topup-1")
    expect(mockFeeFor).not.toHaveBeenCalled()
  })

  it("a quote too close to its expiry to pay again is not paid: start a new top-up", async () => {
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    mockPay.mockResolvedValueOnce({ record: record(), result: { status: "expired" } })
    await act(async () => press(LL.FlashcardV2.topUpPay()))

    expect(screen.getByTestId("topup-refused").props.children).toBe(
      LL.FlashcardV2.topUpInvoiceExpired(),
    )
    expect(mockMint).not.toHaveBeenCalled()
  })

  it("a pay that failed before anything was sent says nothing was paid; after, that it is unknown", async () => {
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))

    mockPay.mockRejectedValueOnce(new Error("Network request failed"))
    mockStoreGet.mockResolvedValueOnce(record())
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    expect(errorText()).toBe(LL.FlashcardV2.topUpPrepareFailed())

    mockPay.mockRejectedValueOnce(new Error("Keychain write failed"))
    mockStoreGet.mockResolvedValueOnce(
      record({
        payment: { ...record().payment, dispatched: true, everDispatched: true },
      }),
    )
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    expect(errorText()).toBe(LL.FlashcardV2.topUpPaymentUnknown())

    // An unreadable store says nothing either way: unknown.
    mockPay.mockRejectedValueOnce(new Error("Keychain write failed"))
    mockStoreGet.mockRejectedValueOnce(new Error("User interaction is not allowed"))
    await act(async () => press(LL.FlashcardV2.topUpRetry()))
    expect(errorText()).toBe(LL.FlashcardV2.topUpPaymentUnknown())
  })

  it("a paid quote the mint no longer issues says so, and to contact support", async () => {
    mockMint.mockRejectedValueOnce(new TopUpError("expired", "quote expired"))
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    await act(async () => press(LL.FlashcardV2.topUpPay()))

    await waitFor(() =>
      expect(screen.getByTestId("topup-working").props.children).toBe(
        LL.FlashcardV2.topUpMintExpired(),
      ),
    )
  })

  it("a load the mint holds part of for now says so, and loads nothing more from here", async () => {
    mockLoad.mockResolvedValueOnce({
      record: record({ state: "minted", loadStarted: true }),
      reclaim: NO_RECLAIM,
    })
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    await waitFor(() => expect(screen.getByTestId("topup-tap")).toBeTruthy())
    await act(async () => press(LL.FlashcardV2.topUpLoad()))

    expect(screen.getByTestId("topup-refused").props.children).toBe(
      LL.FlashcardV2.topUpHeld(),
    )
    expect(screen.queryByTestId("topup-done")).toBeNull()
  })
})

describe("FlashcardV2TopUpScreen: reclaiming spent slots (ENG-631)", () => {
  it("counts the spent slots the load tap will free as room: a card with no empty slot tops up once the mint has settled them all", async () => {
    mockCard = card({ empty: 0, spent: 32, spentSlots: spentSlots(32) })
    mockReclaimPlanFor.mockResolvedValue({ reclaimable: 32, settling: 0 })
    mockEntered = 1000 // six slots
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))

    expect(screen.queryByTestId("topup-amount-problem")).toBeNull()
    expect(screen.getByTestId("topup-slots").props.children).toBe(
      LL.FlashcardV2.topUpSlotsReclaim({ needed: 6, free: 32, reclaim: 32 }),
    )
    await act(async () => press(LL.FlashcardV2.next()))
    // The engine counts them too, as `reclaimable`, never as empty slots.
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ card: { empty: 0, reclaimable: 32, unit: undefined } }),
    )
  })

  it("asks the mint about no spent slots on a card with none, or with a top-up to resume", async () => {
    await renderSettled()
    expect(mockReclaimPlanFor).not.toHaveBeenCalled()

    mockParams = { topUpId: "topup-1" }
    mockCard = card({ empty: 0, spent: 32, spentSlots: spentSlots(32) })
    mockStoreGet.mockResolvedValue(record({ state: "minted" }))
    renderScreen()
    await waitFor(() => expect(screen.getByTestId("topup-tap")).toBeTruthy())
    expect(mockReclaimPlanFor).not.toHaveBeenCalled()
  })

  it("a mint that cannot say which spent slots are settled leaves them out of the room", async () => {
    mockCard = card({ empty: 5, spent: 20, spentSlots: spentSlots(20) })
    mockReclaimPlanFor.mockRejectedValue(new Error("Network request failed"))
    mockEntered = 1000
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    expect(screen.getByTestId("topup-amount-problem").props.children).toBe(
      LL.FlashcardV2.topUpNoRoom({ needed: 6, free: 5 }),
    )
  })

  it("a card with no room whose spent slots are still settling says how many, and to try later", async () => {
    mockLoad.mockRejectedValueOnce(
      new TopUpError("slots", "no room", {
        reclaimable: 0,
        settling: 3,
        cleared: 0,
        spent: 3,
      }),
    )
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    await waitFor(() => expect(screen.getByTestId("topup-tap")).toBeTruthy())
    await act(async () => press(LL.FlashcardV2.topUpLoad()))

    expect(errorText()).toBe(
      `${LL.FlashcardV2.topUpNoRoomOnCard()} ${LL.FlashcardV2.topUpSlotsSettling({
        count: 3,
      })}`,
    )
    // Still on the load, to try again once they settle.
    expect(screen.getByTestId("topup-tap")).toBeTruthy()
  })

  it("the done step says how many spent slots the load tap freed", async () => {
    mockLoad.mockResolvedValueOnce({
      record: record({ state: "loaded" }),
      reclaim: { reclaimable: 4, settling: 0, cleared: 4, spent: 4 },
    })
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    await waitFor(() => expect(screen.getByTestId("topup-tap")).toBeTruthy())
    await act(async () => press(LL.FlashcardV2.topUpLoad()))

    expect(screen.getByTestId("topup-done")).toBeTruthy()
    expect(screen.getByTestId("topup-reclaimed").props.children).toBe(
      LL.FlashcardV2.topUpReclaimed({ count: 4 }),
    )
    expect(screen.queryByTestId("topup-settling")).toBeNull()
  })

  it("the done step says how many spent slots are still settling when the load fit without them, and nothing when there were none", async () => {
    mockLoad.mockResolvedValueOnce({
      record: record({ state: "loaded" }),
      reclaim: { reclaimable: 0, settling: 2, cleared: 0, spent: 2 },
    })
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    await waitFor(() => expect(screen.getByTestId("topup-tap")).toBeTruthy())
    await act(async () => press(LL.FlashcardV2.topUpLoad()))

    expect(screen.getByTestId("topup-settling").props.children).toBe(
      LL.FlashcardV2.topUpSlotsSettling({ count: 2 }),
    )
    expect(screen.queryByTestId("topup-reclaimed")).toBeNull()

    // A card with nothing spent: the done step says only what was loaded.
    screen.unmount()
    await renderSettled()
    fireEvent.press(screen.getByTestId("amount-input"))
    await act(async () => press(LL.FlashcardV2.next()))
    await act(async () => press(LL.FlashcardV2.topUpPay()))
    await waitFor(() => expect(screen.getByTestId("topup-tap")).toBeTruthy())
    await act(async () => press(LL.FlashcardV2.topUpLoad()))
    expect(screen.getByTestId("topup-done")).toBeTruthy()
    expect(screen.queryByTestId("topup-reclaimed")).toBeNull()
    expect(screen.queryByTestId("topup-settling")).toBeNull()
  })
})
