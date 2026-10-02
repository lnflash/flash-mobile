import { Platform } from "react-native"
import RNModal from "react-native-modal"
import NfcManager from "react-native-nfc-manager"
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native"

import {
  FlashcardSnapshot,
  PROVIDER_RENDER_TIMEOUT_MS,
  renderProvider,
} from "./flashcard-harness"

jest.mock("js-lnurl", () => ({ getParams: jest.fn() }))
jest.mock("axios", () => ({ get: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))
// A read asks the mint for keyset units; no spec reaches the network.
jest.mock("@app/utils/cashu-mint", () => ({
  ...jest.requireActual("@app/utils/cashu-mint"),
  unitsForKeysets: jest.fn(),
}))

// Android has no system NFC sheet, so the provider shows its own while a read
// waits for a card. React Native's Modal host measures a bottom-pinned
// sheet wrongly on Android under Fabric (#545): it drew this one off-screen, with no
// Cancel in reach. These pin that it renders inline and that every way out
// ends the read.

const requestTechnology = NfcManager.requestTechnology as jest.Mock
const cancelTechnologyRequest = NfcManager.cancelTechnologyRequest as jest.Mock

let latest: FlashcardSnapshot | undefined

const sheet = () => screen.UNSAFE_getByType(RNModal)

/** Starts a read whose card never comes, so the sheet stays up. */
const startRead = async () => {
  renderProvider((snapshot) => {
    latest = snapshot
  })
  await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
  act(() => {
    latest?.readFlashcard()
  })
}

describe("the Android scan sheet", () => {
  jest.setTimeout(PROVIDER_RENDER_TIMEOUT_MS)

  beforeEach(() => {
    jest.clearAllMocks()
    latest = undefined
    ;(NfcManager.isSupported as jest.Mock).mockResolvedValue(true)
    ;(NfcManager.isEnabled as jest.Mock).mockResolvedValue(true)
    requestTechnology.mockReturnValue(
      new Promise(() => {
        // A card that never comes: the read waits, and the sheet stays up.
      }),
    )
  })

  it("renders inline while a read waits, and its Cancel ends the read", async () => {
    const os = jest.replaceProperty(Platform, "OS", "android")
    try {
      await startRead()
      await waitFor(() => expect(sheet().props.isVisible).toBe(true))
      expect(sheet().props.coverScreen).toBe(false)
      expect(screen.getByText("Ready to Scan")).toBeTruthy()

      fireEvent.press(screen.getByText("Cancel"))
      expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(sheet().props.isVisible).toBe(false))
    } finally {
      os.restore()
    }
  })

  it("ends the read on Android's back button and on a tap outside the sheet", async () => {
    const os = jest.replaceProperty(Platform, "OS", "android")
    try {
      await startRead()
      await waitFor(() => expect(sheet().props.isVisible).toBe(true))
      act(() => {
        sheet().props.onBackButtonPress()
      })
      expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(sheet().props.isVisible).toBe(false))

      act(() => {
        latest?.readFlashcard()
      })
      await waitFor(() => expect(sheet().props.isVisible).toBe(true))
      act(() => {
        sheet().props.onBackdropPress()
      })
      expect(cancelTechnologyRequest).toHaveBeenCalledTimes(2)
    } finally {
      os.restore()
    }
  })

  it("never shows on iOS, whose own sheet asks for the tap", async () => {
    const os = jest.replaceProperty(Platform, "OS", "ios")
    try {
      await startRead()
      await waitFor(() => expect(requestTechnology).toHaveBeenCalled())
      expect(sheet().props.isVisible).toBe(false)
    } finally {
      os.restore()
    }
  })
})
