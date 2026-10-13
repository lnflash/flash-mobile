/**
 * ENG-675: the owner's limits on a Cashu card (card protocol 2.0; architect's
 * decision 16). All off on a new card, the rollover budget 7 (1 to 30, the
 * owner's to change); one tap of the owner's thirteen-byte SET_LIMIT; only
 * this phone, the owner, can save them.
 */
import * as React from "react"
import { Provider } from "react-redux"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"

import type { CardOperationOptions, CashuCardState } from "../../app/contexts/Flashcard"
import appTheme from "../../app/rne-theme/theme"
import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import { store } from "../../app/store/redux"
import {
  cardLimitsSet,
  cardSeen,
  resetFlashcardV2,
} from "../../app/store/redux/slices/flashcardV2Slice"
import {
  FlashcardV2LimitsScreen,
  limitsFromFields,
} from "../../app/screens/card-screen/flashcard-v2-limits"
import { CardError, Transceiver } from "../../app/utils/cashu-card"
import { FAKE_OWNER_KEY, FakeCard, createFakeCard } from "../helpers/fake-cashu"
import { cardRecord, cashuCardState } from "../helpers/cashu-card-state"

loadLocale("en")
const LL = i18nObject("en")

const mockGoBack = jest.fn()
const mockToast = jest.fn()
const mockOwnerKeyFor = jest.fn()
const mockSaveOwnerKey = jest.fn()
let mockCard: CashuCardState | undefined
let capturedOptions: CardOperationOptions | undefined
let mockRunResult: (op: (t: Transceiver) => Promise<unknown>) => Promise<unknown>

jest.mock("@app/i18n/i18n-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
}))
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)
jest.mock("@app/utils/toast", () => ({
  toastShow: (...args: unknown[]) => mockToast(...args),
}))
jest.mock("@app/utils/cashu-card-owner-store", () => ({
  ...jest.requireActual("@app/utils/cashu-card-owner-store"),
  ownerKeyFor: (...args: unknown[]) => mockOwnerKeyFor(...args),
  saveOwnerKey: (...args: unknown[]) => mockSaveOwnerKey(...args),
}))
jest.mock("@app/hooks", () => ({
  useFlashcard: () => ({
    cashuCard: mockCard,
    runCardOperation: async (
      op: (t: Transceiver) => Promise<unknown>,
      _pubkey: string,
      options?: CardOperationOptions,
    ) => {
      capturedOptions = options
      return mockRunResult(op)
    },
  }),
}))

const OWNER = { privateKey: FAKE_OWNER_KEY, source: "seed", saved: true }

const renderScreen = () =>
  render(
    <Provider store={store}>
      <ThemeProvider
        theme={createTheme({
          mode: "light",
          lightColors: appTheme.lightColors,
          darkColors: appTheme.darkColors,
        })}
      >
        <FlashcardV2LimitsScreen />
      </ThemeProvider>
    </Provider>,
  )

const field = (id: string) => screen.getByTestId(id)
const set = (id: string, text: string) => fireEvent.changeText(field(id), text)
const save = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId("limits-save"))
  })
}

describe("FlashcardV2LimitsScreen", () => {
  let card: FakeCard

  beforeEach(() => {
    jest.clearAllMocks()
    store.dispatch(resetFlashcardV2())
    card = createFakeCard(128, { pin: "1234" })
    mockCard = cashuCardState({ pubkey: card.pubkey })
    mockRunResult = (op) => op(card.transceive)
    mockOwnerKeyFor.mockResolvedValue(OWNER)
    mockSaveOwnerKey.mockResolvedValue(undefined)
  })

  it("shows every limit off on a new card, and the rollover budget at 7; a payment limit this phone never set is blank, not 0", () => {
    renderScreen()
    expect(screen.getByTestId("limits-intro").props.children).toBe(
      LL.FlashcardV2.limitsIntro(),
    )
    expect(field("limits-day").props.value).toBe("0")
    // The card says it only under the owner's grant: blank keeps the card's.
    expect(field("limits-payment").props.value).toBe("")
    expect(field("limits-payment").props.placeholder).toBe(
      LL.FlashcardV2.limitsPaymentKept(),
    )
    expect(field("limits-allowance").props.value).toBe("0")
    expect(field("limits-roll-budget").props.value).toBe("7")
  })

  it("a phone that never set the payment limit keeps the card's own when it saves another limit: the grant, GET_INFO under it, then SET_LIMIT with it", async () => {
    // Set by the owner earlier, from another phone or before a record was cleared.
    card = createFakeCard(128, { pin: "1234", limits: { payment: 2500 } })
    mockRunResult = (op) => op(card.transceive)
    mockCard = cashuCardState({ pubkey: card.pubkey })
    store.dispatch(
      cardSeen({
        pubkey: card.pubkey,
        version: "2.0",
        pinState: "set",
        lastBalance: 0,
        owned: true,
        needsUpdate: false,
        limits: { day: 0, allowance: 0 },
        at: 1,
      }),
    )
    renderScreen()
    set("limits-day", "5000")

    await save()

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(card.ins()).toEqual([0x44, 0x45, 0x01, 0x44, 0x34])
    expect(card.limits()).toEqual({
      day: 5000,
      payment: 2500,
      allowance: 0,
      rollBudget: 7,
    })
    // What the phone now knows is what the card holds.
    expect(store.getState().flashcardV2.cards[card.pubkey].limits).toMatchObject({
      day: 5000,
      payment: 2500,
    })
  })

  it("a payment limit this phone set, which another phone with the same key has changed since, is the card's when only the daily limit is edited", async () => {
    // This phone stored 5000; the card now holds 0 (another phone removed it).
    card = createFakeCard(128, { pin: "1234", limits: { payment: 0 } })
    mockRunResult = (op) => op(card.transceive)
    mockCard = cashuCardState({ pubkey: card.pubkey })
    store.dispatch(
      cardSeen({
        pubkey: card.pubkey,
        version: "2.0",
        pinState: "set",
        lastBalance: 0,
        owned: true,
        needsUpdate: false,
        limits: { day: 0, allowance: 0 },
        at: 1,
      }),
    )
    store.dispatch(
      cardLimitsSet({
        pubkey: card.pubkey,
        limits: { day: 0, payment: 5000, allowance: 0, rollBudget: 7 },
      }),
    )
    renderScreen()
    expect(field("limits-payment").props.value).toBe("5000")
    set("limits-day", "3000")

    await save()

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    // The grant, GET_INFO under it, then SET_LIMIT with the card's payment limit.
    expect(card.ins()).toEqual([0x44, 0x45, 0x01, 0x44, 0x34])
    const setLimit = card.transceive.mock.calls
      .map(([apdu]) => apdu)
      .find((a) => a[1] === 0x34)
    expect(setLimit?.slice(-13)).toEqual([0, 0, 0x0b, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 7])
    expect(card.limits()).toEqual({ day: 3000, payment: 0, allowance: 0, rollBudget: 7 })
    expect(store.getState().flashcardV2.cards[card.pubkey].limits).toMatchObject({
      day: 3000,
      payment: 0,
    })
  })

  it("a payment limit this phone set and the owner edits here is the one written, with no read first", async () => {
    card = createFakeCard(128, { pin: "1234", limits: { payment: 0 } })
    mockRunResult = (op) => op(card.transceive)
    mockCard = cashuCardState({ pubkey: card.pubkey })
    store.dispatch(
      cardSeen({
        pubkey: card.pubkey,
        version: "2.0",
        pinState: "set",
        lastBalance: 0,
        owned: true,
        needsUpdate: false,
        limits: { day: 0, allowance: 0 },
        at: 1,
      }),
    )
    store.dispatch(
      cardLimitsSet({
        pubkey: card.pubkey,
        limits: { day: 0, payment: 5000, allowance: 0, rollBudget: 7 },
      }),
    )
    renderScreen()
    set("limits-payment", "4000")

    await save()

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(card.ins()).toEqual([0x44, 0x34])
    expect(card.limits().payment).toBe(4000)
  })

  it("a payment limit typed on a phone that never set one is the one written, with no read first", async () => {
    card = createFakeCard(128, { pin: "1234", limits: { payment: 2500 } })
    mockRunResult = (op) => op(card.transceive)
    mockCard = cashuCardState({ pubkey: card.pubkey })
    renderScreen()
    set("limits-payment", "0")

    await save()

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(card.ins()).toEqual([0x44, 0x34])
    expect(card.limits().payment).toBe(0)
  })

  it("a card that refuses the grant when the payment limit is read says this phone is not its owner, and writes nothing", async () => {
    card = createFakeCard(128, { pin: "1234", limits: { payment: 2500 } })
    mockRunResult = (op) => op(card.transceive)
    mockCard = cashuCardState({ pubkey: card.pubkey })
    mockOwnerKeyFor.mockResolvedValue({ ...OWNER, privateKey: "11".repeat(32) })
    renderScreen()
    set("limits-day", "1")

    await save()

    await waitFor(() =>
      expect(screen.getByTestId("limits-error").props.children).toBe(
        LL.FlashcardV2.notOwner(),
      ),
    )
    expect(card.ins()).toEqual([0x44, 0x45])
    expect(card.limits()).toMatchObject({ day: 0, payment: 2500 })
  })

  it("shows what the card holds, and the payment limit this phone last set (the card says it only under the grant)", () => {
    mockCard = cashuCardState({
      pubkey: card.pubkey,
      dailyLimit: 5000,
      allowance: 250,
      record: cardRecord({ rollBudget: 12 }),
    })
    store.dispatch(
      cardSeen({
        pubkey: card.pubkey,
        version: "2.0",
        pinState: "set",
        lastBalance: 0,
        owned: true,
        needsUpdate: false,
        limits: { day: 5000, allowance: 250 },
        at: 1,
      }),
    )
    store.dispatch(
      cardLimitsSet({
        pubkey: card.pubkey,
        limits: { day: 5000, payment: 1000, allowance: 250, rollBudget: 12 },
      }),
    )
    renderScreen()
    expect(field("limits-day").props.value).toBe("5000")
    expect(field("limits-payment").props.value).toBe("1000")
    expect(field("limits-allowance").props.value).toBe("250")
    expect(field("limits-roll-budget").props.value).toBe("12")
  })

  const seenOwned = (pubkey: string) =>
    store.dispatch(
      cardSeen({
        pubkey,
        version: "2.0",
        pinState: "set",
        lastBalance: 0,
        owned: true,
        needsUpdate: false,
        limits: { day: 5000, allowance: 250 },
        at: 1,
      }),
    )

  it("opens the payment field at the card's own limit from its last read, over what this phone stored: another phone with the same key removed it", () => {
    // This phone set 5000; phone B (same seed) has since set 0, and the card
    // said 0 under the owner's grant at the last read.
    mockCard = cashuCardState({
      pubkey: card.pubkey,
      dailyLimit: 5000,
      allowance: 250,
      ownerPaymentLimit: 0,
    })
    seenOwned(card.pubkey)
    store.dispatch(
      cardLimitsSet({
        pubkey: card.pubkey,
        limits: { day: 5000, payment: 5000, allowance: 250, rollBudget: 7 },
      }),
    )
    renderScreen()
    expect(field("limits-payment").props.value).toBe("0")
    expect(screen.queryByTestId("limits-payment-remark")).toBeNull()
  })

  it("labels a stored payment limit as last known when the card has not said its own to this phone", () => {
    mockCard = cashuCardState({ pubkey: card.pubkey, dailyLimit: 5000, allowance: 250 })
    seenOwned(card.pubkey)
    store.dispatch(
      cardLimitsSet({
        pubkey: card.pubkey,
        limits: { day: 5000, payment: 1000, allowance: 250, rollBudget: 7 },
      }),
    )
    renderScreen()
    expect(field("limits-payment").props.value).toBe("1000")
    expect(screen.getByTestId("limits-payment-remark").props.children).toBe(
      LL.FlashcardV2.limitsPaymentLastKnown(),
    )
  })

  it("saves with one tap of the owner's thirteen-byte SET_LIMIT, the budget included, and remembers what it set", async () => {
    store.dispatch(
      cardSeen({
        pubkey: card.pubkey,
        version: "2.0",
        pinState: "set",
        lastBalance: 0,
        owned: true,
        needsUpdate: false,
        limits: { day: 0, allowance: 0 },
        at: 1,
      }),
    )
    renderScreen()
    set("limits-day", "5000")
    set("limits-payment", "1000")
    set("limits-allowance", "250")
    set("limits-roll-budget", "12")

    await save()

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(card.ins()).toEqual([0x44, 0x34])
    const setLimit = card.transceive.mock.calls
      .map(([apdu]) => apdu)
      .find((a) => a[1] === 0x34)
    // proof length, the proof, then the thirteen bytes of value.
    expect(setLimit?.slice(-13)).toEqual([
      0, 0, 0x13, 0x88, 0, 0, 0x03, 0xe8, 0, 0, 0, 0xfa, 12,
    ])
    expect(card.limits()).toEqual({
      day: 5000,
      payment: 1000,
      allowance: 250,
      rollBudget: 12,
    })
    // A lost re-read keeps the budget just written, not the one the field opened at.
    expect(capturedOptions?.assume).toEqual({
      dailyLimit: 5000,
      allowance: 250,
      record: { dailyLimit: 5000, rollBudget: 12 },
    })
    expect(store.getState().flashcardV2.cards[card.pubkey].limits).toMatchObject({
      day: 5000,
      payment: 1000,
      allowance: 250,
      rollBudget: 12,
    })
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", message: LL.FlashcardV2.limitsSaved() }),
    )
  })

  it("keeps the allowance off on a card with no PIN, which refuses one (6985), and says why", async () => {
    card = createFakeCard(128)
    mockRunResult = (op) => op(card.transceive)
    mockCard = cashuCardState({ pubkey: card.pubkey, pinState: "unset" })
    renderScreen()
    expect(field("limits-allowance").props.editable).toBe(false)
    expect(screen.getByText(LL.FlashcardV2.limitsAllowanceNoPin())).toBeTruthy()
    set("limits-day", "3000")
    await save()
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled())
    expect(card.limits()).toEqual({ day: 3000, payment: 0, allowance: 0, rollBudget: 7 })
  })

  const invalid: [string, string, string][] = [
    ["a rollover budget of 0", "limits-roll-budget", "0"],
    ["a rollover budget past 30", "limits-roll-budget", "31"],
    ["an empty daily limit", "limits-day", ""],
    ["a limit past the four bytes", "limits-payment", "99999999999"],
  ]
  invalid.forEach(([name, id, text]) => {
    it(`refuses ${name} before any tap`, async () => {
      renderScreen()
      set(id, text)
      await save()
      expect(screen.getByTestId("limits-error").props.children).toBe(
        LL.FlashcardV2.limitsInvalid(),
      )
      expect(card.ins()).toEqual([])
    })
  })

  it("a phone that holds no key for the card says so, and taps nothing", async () => {
    mockOwnerKeyFor.mockResolvedValue(undefined)
    renderScreen()
    await save()
    expect(screen.getByTestId("limits-error").props.children).toBe(
      LL.FlashcardV2.notOwner(),
    )
    expect(card.ins()).toEqual([])
  })

  it("a card that refuses this phone's proof (6A91) says so, and its limits stay", async () => {
    mockOwnerKeyFor.mockResolvedValue({ ...OWNER, privateKey: "11".repeat(32) })
    renderScreen()
    set("limits-day", "1")
    await save()
    await waitFor(() =>
      expect(screen.getByTestId("limits-error").props.children).toBe(
        LL.FlashcardV2.notOwner(),
      ),
    )
    expect(card.limits().day).toBe(0)
  })

  it("a card with no owner (6A90) says to set it up first", async () => {
    mockRunResult = async () => {
      throw new CardError(0x6a90, "GET_NONCE")
    }
    renderScreen()
    await save()
    await waitFor(() =>
      expect(screen.getByTestId("limits-error").props.children).toBe(
        LL.FlashcardV2.noOwner(),
      ),
    )
  })
})

describe("limitsFromFields", () => {
  it("reads whole numbers of sats and a budget of 1 to 30", () => {
    expect(
      limitsFromFields({ day: "5000", payment: "0", allowance: "250", rollBudget: "7" }),
    ).toEqual({ day: 5000, payment: 0, allowance: 250, rollBudget: 7 })
    expect(
      limitsFromFields({ day: "0", payment: "0", allowance: "0", rollBudget: "30" }),
    ).toEqual({ day: 0, payment: 0, allowance: 0, rollBudget: 30 })
  })

  it("refuses anything else", () => {
    ;[
      { day: "-1", payment: "0", allowance: "0", rollBudget: "7" },
      { day: "1.5", payment: "0", allowance: "0", rollBudget: "7" },
      { day: "1", payment: "0", allowance: "0", rollBudget: "0" },
      { day: "1", payment: "0", allowance: "0", rollBudget: "31" },
      { day: "1", payment: "4294967296", allowance: "0", rollBudget: "7" },
    ].forEach((fields) => expect(limitsFromFields(fields)).toBeUndefined())
  })
})
