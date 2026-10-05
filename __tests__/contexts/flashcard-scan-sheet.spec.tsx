import React from "react"
import {
  BackHandler,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
} from "react-native"
import RNModal from "react-native-modal"
import NfcManager from "react-native-nfc-manager"
import { SafeAreaView } from "react-native-safe-area-context"
import type { ReactTestInstance } from "react-test-renderer"
import { ParamListBase, useIsFocused } from "@react-navigation/native"
import { createStackNavigator, StackScreenProps } from "@react-navigation/stack"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native"

import { NavigationContainerWrapper } from "@app/navigation/navigation-container-wrapper"

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
// React Native's own BackHandler mock. A press runs the newest listener first
// and stops at the first that handles it, as Android does, so Back reaches
// whichever listener the real order would give it.
jest.mock("react-native/Libraries/Utilities/BackHandler", () =>
  require("react-native/Libraries/Utilities/__mocks__/BackHandler"),
)
// The navigation container hides the splash screen once it is ready.
jest.mock("react-native-bootsplash", () => ({
  __esModule: true,
  default: { hide: jest.fn() },
}))

// Android has no system NFC sheet, so the provider shows its own while a read
// waits for a card. React Native's Modal host measures a bottom-pinned
// sheet wrongly on Android under Fabric (#545): it drew this one off-screen, with no
// Cancel in reach. These pin that it renders inline, in the frame that holds the
// app, with Cancel inside the bottom inset; that every way out ends the read; and
// that Back reaches the sheet before React Navigation does. Jest has no layout
// engine, so none of this proves the sheet draws right on a device. An API 35
// emulator drew it right in both navigation modes (2026-10-04). The Pixel check
// blocks the 0.7.3 Android RC as ENG-624, so it is tracked outside the PR body.

const requestTechnology = NfcManager.requestTechnology as jest.Mock
const cancelTechnologyRequest = NfcManager.cancelTechnologyRequest as jest.Mock
const backHandler = BackHandler as typeof BackHandler & { mockPressBack: () => void }

let latest: FlashcardSnapshot | undefined

const keepSnapshot = (snapshot: FlashcardSnapshot) => {
  latest = snapshot
}

const sheet = () => screen.UNSAFE_getByType(RNModal)

/** Android's Back button, delivered through BackHandler as the device does. */
const pressBack = () =>
  act(() => {
    backHandler.mockPressBack()
  })

/** Starts a read whose card never comes, so the sheet stays up. */
const startRead = async () => {
  renderProvider(keepSnapshot)
  await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
  act(() => {
    latest?.readFlashcard()
  })
}

const Stack = createStackNavigator()

/** The screen a card screen is pushed over. It says when it is on top again. */
const Below = ({ navigation }: StackScreenProps<ParamListBase>) => {
  const onTop = useIsFocused()
  return (
    <Text onPress={() => navigation.navigate("CardScreen")}>
      {onTop ? "below, on top" : "below"}
    </Text>
  )
}

/** Stands in for FlashcardV2Pin or FlashcardV2TopUp, where a card operation reads. */
const CardScreen = () => <Text>card screen</Text>

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
      // RCTModalHostView is what #545 breaks. While the sheet is up no core
      // Modal may be in the tree: that is the inline path coverScreen={false}
      // has to keep, whatever the prop's value says.
      expect(screen.UNSAFE_queryAllByType(Modal)).toHaveLength(0)
      expect(sheet().props.coverScreen).toBe(false)
      expect(screen.getByText("Ready to Scan")).toBeTruthy()

      fireEvent.press(screen.getByText("Cancel"))
      expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(sheet().props.isVisible).toBe(false))
    } finally {
      os.restore()
    }
  })

  it("keeps Cancel inside the bottom inset, in the frame that holds the app", async () => {
    const os = jest.replaceProperty(Platform, "OS", "android")
    try {
      renderProvider(keepSnapshot, { children: <Text>the app</Text> })
      await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
      act(() => {
        latest?.readFlashcard()
      })
      await waitFor(() => expect(sheet().props.isVisible).toBe(true))

      // Under Android's forced edge-to-edge the navigation bar draws over the
      // app, and only the bottom safe-area inset keeps Cancel above it. On the
      // emulator Cancel ended one bar height plus the sheet's padding above the
      // bottom, in gesture and in 3-button navigation. Bottom only: the sheet
      // sits on the bottom edge, so a top inset would open a gap inside it.
      const inset = within(sheet()).UNSAFE_getByType(SafeAreaView)
      expect(inset.props.edges).toEqual(["bottom"])
      expect(within(inset).getByText("Cancel")).toBeTruthy()

      // Inline, the sheet covers its parent and nothing more, so its parent
      // has to be the frame the whole app renders in.
      const frame = sheet().parent
      expect(frame).not.toBeNull()
      expect(StyleSheet.flatten(frame?.props.style)).toMatchObject({ flex: 1 })
      expect(within(frame as ReactTestInstance).getByText("the app")).toBeTruthy()
    } finally {
      os.restore()
    }
  })

  it("ends the read on Android's back button and on a tap outside the sheet", async () => {
    const os = jest.replaceProperty(Platform, "OS", "android")
    try {
      await startRead()
      await waitFor(() => expect(sheet().props.isVisible).toBe(true))
      pressBack()
      expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
      // Handled: the press went no further, so nothing behind the sheet saw it.
      expect(BackHandler.exitApp).not.toHaveBeenCalled()
      await waitFor(() => expect(sheet().props.isVisible).toBe(false))

      act(() => {
        latest?.readFlashcard()
      })
      await waitFor(() => expect(sheet().props.isVisible).toBe(true))
      // The backdrop react-native-modal draws, not the prop it was handed.
      fireEvent.press(within(sheet()).UNSAFE_getByType(TouchableWithoutFeedback))
      expect(cancelTechnologyRequest).toHaveBeenCalledTimes(2)
    } finally {
      os.restore()
    }
  })

  it("takes Back before React Navigation while it is up, and only then", async () => {
    const os = jest.replaceProperty(Platform, "OS", "android")
    try {
      // As app.tsx mounts it: inside the app's navigation container, above the
      // navigator. The container's own Back listener pops the top screen, and
      // the newest listener hears Back first.
      renderProvider(keepSnapshot, {
        container: NavigationContainerWrapper,
        children: (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Below" component={Below} />
            <Stack.Screen name="CardScreen" component={CardScreen} />
          </Stack.Navigator>
        ),
      })
      // The container renders nothing until getInitialURL resolves.
      fireEvent.press(await screen.findByText("below, on top"))
      await screen.findByText("card screen")
      expect(screen.queryByText("below, on top")).toBeNull()

      act(() => {
        latest?.readFlashcard()
      })
      await waitFor(() => expect(sheet().props.isVisible).toBe(true))
      pressBack()
      expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(sheet().props.isVisible).toBe(false))
      // React Navigation never heard it: the card screen is still on top.
      expect(screen.queryByText("below, on top")).toBeNull()

      // Down, the sheet stays mounted, and Back has to go past it.
      pressBack()
      await screen.findByText("below, on top")
      expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
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
