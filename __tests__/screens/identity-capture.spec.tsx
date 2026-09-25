/**
 * ENG-608 — IdentityCapture: permission gate, still gate, accept → persist →
 * next side, and a way out of the screen.
 */
import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import IdentityCapture from "../../app/screens/account-upgrade-flow/IdentityCapture"

type ScreenProps = React.ComponentProps<typeof IdentityCapture>
import type {
  IdentityDocumentType,
  IdentitySide,
  IdentityState,
} from "@app/store/redux/slices/accountUpgradeSlice"

const mockNavigate = jest.fn()
const mockPush = jest.fn()
const mockGoBack = jest.fn()
const mockDispatch = jest.fn()
const mockTakePhoto = jest.fn()
const mockPersistCapture = jest.fn()
const mockUseCameraPermission = jest.fn()
const mockUseCameraDevice = jest.fn()

let mockIdentity: IdentityState

jest.mock("@app/store/redux", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ accountUpgrade: { identity: mockIdentity } }),
  useAppDispatch: () => mockDispatch,
}))
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}))
jest.mock("@app/utils/identity-files", () => ({
  persistCapture: (...args: unknown[]) => mockPersistCapture(...args),
}))
jest.mock("@app/components/account-upgrade-flow", () => {
  const ReactActual = jest.requireActual("react")
  const { View, Text, TouchableOpacity } = jest.requireActual("react-native")
  return {
    CaptureOverlay: () => ReactActual.createElement(View, { testID: "capture-overlay" }),
    CapturePreview: ({
      uri,
      onRetake,
      onAccept,
    }: {
      uri: string
      onRetake: () => void
      onAccept: () => void
    }) =>
      ReactActual.createElement(
        View,
        { testID: "capture-preview" },
        ReactActual.createElement(Text, { testID: "capture-preview-uri" }, uri),
        ReactActual.createElement(
          TouchableOpacity,
          { testID: "capture-retake", onPress: onRetake },
          ReactActual.createElement(Text, null, "Retake"),
        ),
        ReactActual.createElement(
          TouchableOpacity,
          { testID: "capture-accept", onPress: onAccept },
          ReactActual.createElement(Text, null, "Use photo"),
        ),
      ),
  }
})
jest.mock("react-native-vision-camera", () => {
  const ReactActual = jest.requireActual("react")
  const { View } = jest.requireActual("react-native")
  const Camera = ReactActual.forwardRef((props: unknown, ref: unknown) => {
    ReactActual.useImperativeHandle(ref, () => ({
      takePhoto: (...args: unknown[]) => mockTakePhoto(...args),
    }))
    return ReactActual.createElement(View, { testID: "vision-camera" })
  })
  return {
    __esModule: true,
    Camera,
    CameraRuntimeError: Error,
    useCameraDevice: (...args: unknown[]) => mockUseCameraDevice(...args),
    useCameraPermission: () => mockUseCameraPermission(),
  }
})

loadLocale("en")
const en = i18nObject("en")

const identity = (documentType: IdentityDocumentType = "national_id"): IdentityState => ({
  documentType,
  front: undefined,
  back: undefined,
  selfie: undefined,
  uploaded: {},
})

const renderCapture = (params: {
  side: IdentitySide
  resubmit?: boolean
  returnToReview?: boolean
}) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <IdentityCapture
        navigation={
          {
            navigate: mockNavigate,
            push: mockPush,
            goBack: mockGoBack,
          } as unknown as ScreenProps["navigation"]
        }
        route={
          { key: "r", name: "IdentityCapture", params } as unknown as ScreenProps["route"]
        }
      />
    </ThemeProvider>,
  )

const shoot = async (
  utils: ReturnType<typeof renderCapture>,
  still = { path: "/tmp/cam/still.jpg", width: 4032, height: 3024 },
) => {
  mockTakePhoto.mockResolvedValue(still)
  await act(async () => {
    fireEvent.press(utils.getByTestId("capture-shutter"))
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockIdentity = identity()
  mockUseCameraPermission.mockReturnValue({
    hasPermission: true,
    requestPermission: jest.fn(() => Promise.resolve(true)),
  })
  mockUseCameraDevice.mockReturnValue({ id: "back" })
  mockPersistCapture.mockResolvedValue("idv/front-1.jpg")
})

describe("IdentityCapture", () => {
  it("with permission denied shows the explanation and no shutter", () => {
    const requestPermission = jest.fn(() => Promise.resolve(false))
    mockUseCameraPermission.mockReturnValue({ hasPermission: false, requestPermission })
    const { getByTestId, queryByTestId, getAllByText } = renderCapture({ side: "front" })

    expect(getByTestId("capture-permission-denied")).toBeTruthy()
    expect(getAllByText(en.AccountUpgrade.openSettings()).length).toBeGreaterThan(0)
    expect(queryByTestId("capture-shutter")).toBeNull()
    expect(queryByTestId("vision-camera")).toBeNull()
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it("always offers a way back: the close control calls goBack", () => {
    // The screen hides the navigation header. With permission denied the only
    // other button is Open Settings, so a close control is the way out.
    mockUseCameraPermission.mockReturnValue({
      hasPermission: false,
      requestPermission: jest.fn(() => Promise.resolve(false)),
    })
    const { getByTestId } = renderCapture({ side: "front" })

    fireEvent.press(getByTestId("capture-close"))

    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it("with no camera device shows the no-camera message, close still works", () => {
    mockUseCameraDevice.mockReturnValue(undefined)
    const { getByTestId, queryByTestId } = renderCapture({ side: "front" })

    expect(getByTestId("capture-no-camera")).toBeTruthy()
    expect(queryByTestId("capture-shutter")).toBeNull()
    fireEvent.press(getByTestId("capture-close"))
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it("uses the front camera for the selfie and the back camera for the ID", () => {
    renderCapture({ side: "selfie" })
    expect(mockUseCameraDevice).toHaveBeenLastCalledWith("front")
    renderCapture({ side: "back" })
    expect(mockUseCameraDevice).toHaveBeenLastCalledWith("back")
  })

  it("rejects a still that is too small to read and keeps nothing", async () => {
    const utils = renderCapture({ side: "front" })

    await shoot(utils, { path: "/tmp/cam/small.jpg", width: 800, height: 600 })

    expect(utils.getByTestId("capture-error").props.children).toBe(
      en.AccountUpgrade.captureTooSmall(),
    )
    expect(utils.queryByTestId("capture-preview")).toBeNull()
    expect(mockPersistCapture).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("shows the capture-failed message when the camera throws", async () => {
    const utils = renderCapture({ side: "front" })
    mockTakePhoto.mockRejectedValue(new Error("session interrupted"))

    await act(async () => {
      fireEvent.press(utils.getByTestId("capture-shutter"))
    })

    expect(utils.getByTestId("capture-error").props.children).toBe(
      en.AccountUpgrade.captureFailed(),
    )
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it("previews the temp still; retake returns to the camera without persisting", async () => {
    const utils = renderCapture({ side: "front" })

    await shoot(utils)

    expect(utils.getByTestId("capture-preview-uri").props.children).toBe(
      "file:///tmp/cam/still.jpg",
    )
    fireEvent.press(utils.getByTestId("capture-retake"))
    expect(utils.queryByTestId("capture-preview")).toBeNull()
    expect(utils.getByTestId("capture-shutter")).toBeTruthy()
    expect(mockPersistCapture).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it("accept moves the still out of temp, stores the relative path and goes to the back", async () => {
    const utils = renderCapture({ side: "front" })
    await shoot(utils)

    await act(async () => {
      fireEvent.press(utils.getByTestId("capture-accept"))
    })

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1))
    expect(mockPersistCapture).toHaveBeenCalledWith("front", "/tmp/cam/still.jpg", {
      previous: undefined,
    })
    expect(mockDispatch).toHaveBeenCalledWith({
      type: "accountUpgrade/setIdentityCapture",
      payload: {
        side: "front",
        image: expect.objectContaining({
          path: "idv/front-1.jpg",
          width: 4032,
          height: 3024,
          type: "image/jpeg",
        }),
      },
    })
    // Never the temp path: it does not survive an app close or update.
    const dispatched = mockDispatch.mock.calls[0][0].payload.image
    expect(dispatched.path).not.toContain("/tmp/cam")
    expect(mockPush).toHaveBeenCalledWith("IdentityCapture", {
      side: "back",
      resubmit: false,
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("hands the previous file for that side to persistCapture so a retake cleans up", async () => {
    mockIdentity = {
      ...identity(),
      front: {
        path: "idv/front-0.jpg",
        width: 4032,
        height: 3024,
        fileName: "front-0.jpg",
        type: "image/jpeg",
      },
    }
    const utils = renderCapture({ side: "front", returnToReview: true })
    await shoot(utils)

    await act(async () => {
      fireEvent.press(utils.getByTestId("capture-accept"))
    })

    expect(mockPersistCapture).toHaveBeenCalledWith("front", "/tmp/cam/still.jpg", {
      previous: "idv/front-0.jpg",
    })
  })

  it("a passport has no back: accepting the front goes straight to the selfie", async () => {
    mockIdentity = identity("passport")
    const utils = renderCapture({ side: "front", resubmit: true })
    await shoot(utils)

    await act(async () => {
      fireEvent.press(utils.getByTestId("capture-accept"))
    })

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1))
    expect(mockPush).toHaveBeenCalledWith("IdentityCapture", {
      side: "selfie",
      resubmit: true,
    })
  })

  it("after the last side, accept lands on the review screen", async () => {
    const utils = renderCapture({ side: "selfie" })
    await shoot(utils)

    await act(async () => {
      fireEvent.press(utils.getByTestId("capture-accept"))
    })

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1))
    expect(mockNavigate).toHaveBeenCalledWith("IdentityReview", { resubmit: false })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("a retake from review returns to review, whatever side it was", async () => {
    const utils = renderCapture({ side: "front", returnToReview: true })
    await shoot(utils)

    await act(async () => {
      fireEvent.press(utils.getByTestId("capture-accept"))
    })

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1))
    expect(mockNavigate).toHaveBeenCalledWith("IdentityReview", { resubmit: false })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("when the still cannot be moved into place nothing is stored and the user stays", async () => {
    mockPersistCapture.mockRejectedValue(new Error("EACCES"))
    const utils = renderCapture({ side: "front" })
    await shoot(utils)

    await act(async () => {
      fireEvent.press(utils.getByTestId("capture-accept"))
    })

    await waitFor(() => expect(utils.getByTestId("capture-error")).toBeTruthy())
    expect(utils.getByTestId("capture-error").props.children).toBe(
      en.AccountUpgrade.captureFailed(),
    )
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
