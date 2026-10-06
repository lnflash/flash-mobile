/**
 * "Remove card" on the BoltCard screen clears the card AND closes the screen.
 * Clearing alone left the screen up on its "No Cards Found" empty state —
 * which exists for arriving without a card, not for having just removed one.
 * Real provider and real screen; the NFC manager, the network and navigation
 * are stand-ins.
 */
import * as React from "react"
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native"
import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager"
import axios from "axios"

import { loadLocale } from "@app/i18n/i18n-util.sync"
import { CardScreen } from "../../app/screens/card-screen/card"
import {
  FlashcardSnapshot,
  PROVIDER_RENDER_TIMEOUT_MS,
  renderProvider,
} from "../contexts/flashcard-harness"

loadLocale("en")

let focused = true
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  isFocused: () => focused,
  addListener: () => () => {},
}

jest.mock("js-lnurl", () => ({ getParams: jest.fn() }))
jest.mock("axios", () => ({ get: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))
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
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useHideBalanceQuery: () => ({ data: { hideBalance: false } }),
  useScanningQrCodeScreenQuery: () => ({ data: undefined }),
  useAccountDefaultWalletLazyQuery: () => [jest.fn()],
}))
jest.mock("@app/hooks/use-price-conversion", () => ({
  usePriceConversion: () => ({
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

const CARD_PAYLOAD = "lnurlw://card.test.flashapp.me/boltcard?p=PARAM_P&c=PARAM_C"
const BALANCE_HTML = `<a href="lightning:lnurl1CARD">pay</a><dt>1,234 SATS</dt>`

const requestTechnology = NfcManager.requestTechnology as jest.Mock
const getTag = NfcManager.getTag as jest.Mock

let latest: FlashcardSnapshot | undefined

const tapBoltCard = async () => {
  requestTechnology.mockResolvedValue(NfcTech.Ndef)
  getTag.mockResolvedValue({ id: "04AABBCC", ndefMessage: [{ payload: [1, 2, 3] }] })
  await act(async () => {
    await latest?.readFlashcard()
  })
  await waitFor(() => expect(latest?.lnurl).toBe("lnurl1CARD"))
}

const mountScreen = () =>
  renderProvider(
    (snapshot) => {
      latest = snapshot
    },
    { isAuthed: true, children: <CardScreen /> },
  )

describe("CardScreen (BoltCard) against the real provider", () => {
  jest.setTimeout(PROVIDER_RENDER_TIMEOUT_MS)

  beforeEach(() => {
    latest = undefined
    focused = true
    jest.spyOn(console, "warn").mockImplementation(() => {})
    ;(Ndef.text.decodePayload as jest.Mock).mockReturnValue(CARD_PAYLOAD)
    ;(axios.get as jest.Mock).mockResolvedValue({ data: BALANCE_HTML })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it("Remove card clears the card and closes the screen instead of showing the empty state", async () => {
    mountScreen()
    await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
    await tapBoltCard()
    await waitFor(() => expect(screen.getByText(/Remove/)).toBeTruthy())
    expect(screen.queryByText("No Cards Found")).toBeNull()

    await act(async () => {
      fireEvent.press(screen.getByText(/Remove/))
    })

    expect(latest?.lnurl).toBeUndefined()
    expect(latest?.balanceInSats).toBeUndefined()
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1)
    // The popped screen is still mounted for its exit animation, with the
    // card gone: it must not show the empty state on the way out.
    expect(screen.queryByText("No Cards Found")).toBeNull()
  })

  it("a press that lands while the screen is not focused clears the card without popping whatever is on top", async () => {
    mountScreen()
    await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
    await tapBoltCard()
    await waitFor(() => expect(screen.getByText(/Remove/)).toBeTruthy())
    focused = false

    await act(async () => {
      fireEvent.press(screen.getByText(/Remove/))
    })

    expect(latest?.lnurl).toBeUndefined()
    expect(mockNavigation.goBack).not.toHaveBeenCalled()
  })

  it("opening the screen without a card still shows the empty state, and does not close", async () => {
    mountScreen()
    await waitFor(() => expect(latest?.readFlashcard).toBeDefined())

    expect(screen.getByText("No Cards Found")).toBeTruthy()
    expect(mockNavigation.goBack).not.toHaveBeenCalled()
  })
})
