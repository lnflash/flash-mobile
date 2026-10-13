/**
 * ENG-675: the limits screen reopens at the card's own values after a save,
 * with no new read tap. SET_LIMIT always writes the rollover budget (its
 * thirteenth byte, cashu-javacard spec/APDU.md, SET_LIMIT), so a budget field
 * that reopened at the value before the save would write that old budget back
 * at the next save, undoing the owner's choice without a word. The operation's
 * re-read reads GET_CARD for this, and a lost GET_CARD falls back to the
 * budget the save just wrote.
 *
 * Real provider, real store, real screen, real owner-key store (over the
 * Keychain mock); only the NFC manager, the network and navigation are
 * stand-ins.
 */
import * as React from "react"
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native"
import NfcManager, { NfcTech } from "react-native-nfc-manager"
import * as Keychain from "react-native-keychain"

import { store } from "@app/store/redux"
import { resetFlashcardV2 } from "@app/store/redux/slices/flashcardV2Slice"
import { unitsForKeysets } from "@app/utils/cashu-mint"
import { INS } from "@app/utils/cashu-card"
import {
  SEED_SERVER,
  ownerKeyStore,
  resetSeedCache,
} from "@app/utils/cashu-card-owner-store"
import { FlashcardV2LimitsScreen } from "../../app/screens/card-screen/flashcard-v2-limits"
import { FakeCard, createFakeCard } from "../helpers/fake-cashu"
import {
  FlashcardSnapshot,
  PROVIDER_RENDER_TIMEOUT_MS,
  renderProvider,
} from "../contexts/flashcard-harness"

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  isFocused: () => true,
  addListener: () => () => undefined,
}

jest.mock("js-lnurl", () => ({ getParams: jest.fn() }))
jest.mock("axios", () => ({ get: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))
jest.mock("@app/utils/cashu-mint", () => ({
  ...jest.requireActual("@app/utils/cashu-mint"),
  unitsForKeysets: jest.fn(),
}))
// The tip header is fetched off the tap; no spec reaches the network for it.
jest.mock("@app/utils/cashu-card-headers", () => ({
  ...jest.requireActual("@app/utils/cashu-card-headers"),
  refreshTipHeader: jest.fn(async () => undefined),
}))
jest.mock("@app/i18n/i18n-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => mockNavigation,
}))
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)

/** A random owner key this phone saved when it set the card up. */
const DEVICE_KEY = "5a".repeat(32)
const OWNER_STORE = "flashcard-v2-owner"
const PUBKEY_HEX = createFakeCard(1).pubkey

const requestTechnology = NfcManager.requestTechnology as jest.Mock
const transceive = NfcManager.isoDepHandler.transceive as jest.Mock
const getTag = NfcManager.getTag as jest.Mock

let latest: FlashcardSnapshot | undefined
let card: FakeCard
let showLimits: (shown: boolean) => void = () => undefined

/** The limits screen, opened and closed as the owner navigates to it and back. */
const LimitsRoute = () => {
  const [shown, setShown] = React.useState(false)
  showLimits = setShown
  return shown ? <FlashcardV2LimitsScreen /> : null
}

const openLimits = async () => {
  await act(async () => showLimits(true))
  await waitFor(() => expect(screen.getByTestId("limits-intro")).toBeTruthy())
}
const closeLimits = async () => {
  await act(async () => showLimits(false))
  expect(screen.queryByTestId("limits-intro")).toBeNull()
}
const field = (id: string) => screen.getByTestId(id)
const save = async () => {
  const before = mockNavigation.goBack.mock.calls.length
  await act(async () => {
    fireEvent.press(screen.getByTestId("limits-save"))
  })
  await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalledTimes(before + 1))
}
/** The value bytes of the last SET_LIMIT the card was sent: day, payment, allowance, budget. */
const lastSetLimitValue = () => {
  const apdus = card.transceive.mock.calls.map(([apdu]) => apdu)
  const setLimit = apdus.filter((apdu) => apdu[1] === INS.SET_LIMIT).pop()
  return setLimit?.slice(-13)
}

describe("the limits screen after a save (ENG-675)", () => {
  jest.setTimeout(PROVIDER_RENDER_TIMEOUT_MS)

  beforeEach(async () => {
    latest = undefined
    store.dispatch(resetFlashcardV2())
    await Keychain.resetInternetCredentials({ server: SEED_SERVER })
    await Keychain.resetInternetCredentials({ server: OWNER_STORE })
    resetSeedCache()
    jest.spyOn(console, "warn").mockImplementation(() => {})
    ;(unitsForKeysets as jest.Mock).mockResolvedValue({})
    await ownerKeyStore.put(PUBKEY_HEX, {
      privateKey: DEVICE_KEY,
      source: "device",
      createdAt: 1,
    })
    card = createFakeCard(128, { pin: "1234", owner: DEVICE_KEY })
    requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    getTag.mockResolvedValue({ id: "08AABBCC" })
    transceive.mockImplementation((bytes: number[]) => card.transceive(bytes))

    renderProvider(
      (snapshot) => {
        latest = snapshot
      },
      { isAuthed: true, children: <LimitsRoute /> },
    )
    await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
    // The owner's read tap: the card takes this phone's key.
    await act(async () => {
      await latest?.readFlashcard()
    })
    await waitFor(() => expect(latest?.cashuCard?.ownerKeySource).toBe("device"))
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it("reopens at the budget it saved, with no new read, and the next save writes that budget, not the one before it", async () => {
    await openLimits()
    expect(field("limits-roll-budget").props.value).toBe("7")
    fireEvent.changeText(field("limits-roll-budget"), "12")
    await save()

    expect(card.limits().rollBudget).toBe(12)
    expect(lastSetLimitValue()?.[12]).toBe(12)
    // The re-read after SET_LIMIT asked the card for its record.
    const ins = card.ins()
    expect(ins.lastIndexOf(INS.GET_CARD)).toBeGreaterThan(ins.lastIndexOf(INS.SET_LIMIT))
    expect(latest?.cashuCard?.record.rollBudget).toBe(12)
    expect(store.getState().flashcardV2.cards[PUBKEY_HEX]?.limits?.rollBudget).toBe(12)

    // Back, then Limits again, with no tap in between.
    await closeLimits()
    await openLimits()
    expect(field("limits-roll-budget").props.value).toBe("12")

    // Only the daily limit changes: the budget written is still the owner's 12.
    fireEvent.changeText(field("limits-day"), "6000")
    await save()

    expect(lastSetLimitValue()?.[12]).toBe(0x0c)
    expect(card.limits()).toMatchObject({ day: 6000, rollBudget: 12 })
    expect(latest?.cashuCard?.record.rollBudget).toBe(12)
    // A later operation's re-read keeps the card's own budget in the store.
    expect(store.getState().flashcardV2.cards[PUBKEY_HEX]?.limits?.rollBudget).toBe(12)
  })

  it("a GET_CARD lost in the re-read keeps the rest of it, and the budget just written stands in for the card's", async () => {
    // The card leaves the field as the record is asked for, after SET_LIMIT.
    let setLimitSent = false
    transceive.mockImplementation(async (bytes: number[]) => {
      if (bytes[1] === INS.SET_LIMIT) setLimitSent = true
      if (setLimitSent && bytes[1] === INS.GET_CARD) throw new Error("Tag was lost")
      return card.transceive(bytes)
    })
    await openLimits()
    fireEvent.changeText(field("limits-roll-budget"), "12")
    fireEvent.changeText(field("limits-day"), "5000")
    await save()

    expect(card.limits()).toMatchObject({ day: 5000, rollBudget: 12 })
    expect(latest?.cashuCard?.record.rollBudget).toBe(12)
    expect(latest?.cashuCard?.dailyLimit).toBe(5000)

    await closeLimits()
    await openLimits()
    expect(field("limits-roll-budget").props.value).toBe("12")
    expect(field("limits-day").props.value).toBe("5000")
  })
})
