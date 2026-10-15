/**
 * ENG-616: "Remove card" on the Cashu screen, and leaving it signed out, are
 * judged by what this phone still holds afterwards — the redux store and the
 * persisted BoltCard link — not by a mock being called. Real provider, real
 * store, real screen; only the NFC manager, the network and navigation are
 * stand-ins.
 */
import * as React from "react"
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native"
import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager"
import axios from "axios"

import { loadLocale } from "@app/i18n/i18n-util.sync"
import { store } from "@app/store/redux"
import { resetFlashcardV2 } from "@app/store/redux/slices/flashcardV2Slice"
import { unitsForKeysets } from "@app/utils/cashu-mint"
import { FlashcardV2Screen } from "../../app/screens/card-screen/flashcard-v2"
import { createFakeCard } from "../helpers/fake-cashu"
import {
  FlashcardSnapshot,
  PROVIDER_RENDER_TIMEOUT_MS,
  renderProvider,
} from "../contexts/flashcard-harness"

loadLocale("en")

const mockListeners: Record<string, () => void> = {}
// One object for every render, as react-navigation's own is.
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  isFocused: () => true,
  addListener: (event: string, listener: () => void) => {
    mockListeners[event] = listener
    return () => {
      delete mockListeners[event]
    }
  },
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
  // No navigator here: a focus effect runs once, as on a focused screen.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}))
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useHideBalanceQuery: () => ({ data: { hideBalance: false } }),
}))

const KEYSET = [0x00, 0x59, 0x53, 0x4c, 0xe0, 0xbf, 0xa1, 0x9a]

/** A 2.0 card, PIN set, owned, holding one unspent 500 piece in slot 0. */
const fakeCard = createFakeCard(128, { pin: "1234" })
fakeCard.slots[0] = [
  0x01,
  ...KEYSET,
  0,
  0,
  0x01,
  0xf4,
  ...new Array(32).fill(0xab),
  0x02,
  ...new Array(32).fill(0xcd),
  0,
  0,
  0,
  0,
]
const PUBKEY_HEX = fakeCard.pubkey
const cashuCard = (bytes: number[]) => fakeCard.transceive(bytes)

const CARD_PAYLOAD = "lnurlw://card.test.flashapp.me/boltcard?p=PARAM_P&c=PARAM_C"
const BALANCE_HTML = `<a href="lightning:lnurl1CARD">pay</a><dt>1,234 SATS</dt>`

const requestTechnology = NfcManager.requestTechnology as jest.Mock
const transceive = NfcManager.isoDepHandler.transceive as jest.Mock
const getTag = NfcManager.getTag as jest.Mock

let latest: FlashcardSnapshot | undefined
const knownCards = () => store.getState().flashcardV2.cards

const tap = async () => {
  await act(async () => {
    await latest?.readFlashcard()
  })
}

const tapBoltCard = async () => {
  requestTechnology.mockResolvedValue(NfcTech.Ndef)
  getTag.mockResolvedValue({ id: "04AABBCC", ndefMessage: [{ payload: [1, 2, 3] }] })
  await tap()
  await waitFor(() => expect(latest?.lnurl).toBe("lnurl1CARD"))
}

/**
 * Taps the card and waits for the mint to name its unit. A signed-out read
 * (`signedOut`) skips the keyset split (ENG-708), so it waits for the card.
 */
const tapCashuCard = async ({ signedOut = false } = {}) => {
  requestTechnology.mockResolvedValue(NfcTech.IsoDep)
  getTag.mockResolvedValue({ id: "08AABBCC" })
  transceive.mockImplementation(cashuCard)
  await tap()
  if (signedOut) await waitFor(() => expect(latest?.cashuCard).toBeDefined())
  else await waitFor(() => expect(latest?.cashuCard?.unitTotals).toBeDefined())
}

const mountScreen = (isAuthed: boolean, updateState = jest.fn()) =>
  renderProvider(
    (snapshot) => {
      latest = snapshot
    },
    { isAuthed, updateState, children: <FlashcardV2Screen /> },
  )

describe("FlashcardV2Screen against the real provider and store", () => {
  jest.setTimeout(PROVIDER_RENDER_TIMEOUT_MS)

  beforeEach(() => {
    latest = undefined
    store.dispatch(resetFlashcardV2())
    Object.keys(mockListeners).forEach((event) => delete mockListeners[event])
    jest.spyOn(console, "warn").mockImplementation(() => {})
    ;(unitsForKeysets as jest.Mock).mockResolvedValue({ "0059534ce0bfa19a": "sat" })
    ;(Ndef.text.decodePayload as jest.Mock).mockReturnValue(CARD_PAYLOAD)
    ;(axios.get as jest.Mock).mockResolvedValue({ data: BALANCE_HTML })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it("Remove card forgets the Cashu card on this phone and keeps the BoltCard linked", async () => {
    const updateState = jest.fn()
    mountScreen(true, updateState)
    await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
    await tapBoltCard()
    await tapCashuCard()
    expect(knownCards()[PUBKEY_HEX]).toMatchObject({ lastBalance: 500, unit: "sat" })
    expect(screen.getByTestId("flashcard-v2-balance-sat").props.children).toBe("500 sats")
    const persistentWrites = updateState.mock.calls.length
    // The harness mounts the screen before the reads; in the app it opens
    // after one. Only what Remove does counts.
    mockNavigation.goBack.mockClear()

    await act(async () => {
      fireEvent.press(screen.getByText(/Remove/))
    })

    // The phone's record of the card is gone, not just the screen's copy.
    expect(knownCards()).toEqual({})
    expect(latest?.cashuCard).toBeUndefined()
    // The BoltCard link is exactly as it was: nothing cleared it.
    expect(latest?.lnurl).toBe("lnurl1CARD")
    expect(latest?.balanceInSats).toBe(1234)
    expect(updateState).toHaveBeenCalledTimes(persistentWrites)
    // ...and the screen, with nothing left to show, closes.
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1)
  })

  it("a card read signed out is never written to this phone, and leaving the screen forgets it", async () => {
    mountScreen(false)
    await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
    await tapCashuCard({ signedOut: true })

    // Signed out, the read skips the keyset split (ENG-708) and this phone
    // keeps no record to name the unit from: the figure says "unit unknown".
    expect(screen.getByTestId("flashcard-v2-balance-unknown")).toBeTruthy()
    expect(knownCards()).toEqual({})
    expect(screen.queryByText(/Remove/)).toBeNull()

    await act(async () => {
      mockListeners.beforeRemove()
    })

    expect(latest?.cashuCard).toBeUndefined()
    expect(knownCards()).toEqual({})
  })
})
