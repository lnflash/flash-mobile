/**
 * ENG-609, the override half.
 *
 * ThemedStatusBar drives the icon tint from the theme, which is right for every
 * screen that sits on the theme background and wrong for the ones that paint
 * their own full-bleed dark field under the status bar. Under Android 15+
 * forced edge-to-edge there is no opaque band left to hide the mismatch, so a
 * light-theme user on one of these screens gets black icons on black — the
 * exact ENG-609 symptom the themed default was introduced to fix elsewhere.
 *
 * These screens therefore declare `statusBar="light-content"` on `Screen`, and
 * this spec mounts each one and pins that contract. The themed-status-bar spec
 * covers the other half (the global default); neither would have caught this.
 */
import * as React from "react"
import { StatusBar } from "react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, RenderAPI } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"

import IdentityCapture from "../../app/screens/account-upgrade-flow/IdentityCapture"
import SignInViaQRCode from "../../app/screens/import-wallet-screen/SignInViaQRCode"
import { ScanningQRCodeScreen } from "../../app/screens/send-bitcoin-screen/scanning-qrcode-screen"

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    LL: require("../../app/i18n/i18n-util").i18nObject("en"),
  }),
}))
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))

// --- IdentityCapture ---------------------------------------------------------
jest.mock("@app/store/redux", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      accountUpgrade: {
        identity: {
          documentType: "national_id",
          front: undefined,
          back: undefined,
          selfie: undefined,
          uploaded: {},
        },
      },
    }),
  useAppDispatch: () => jest.fn(),
}))
jest.mock("@app/utils/identity-files", () => ({
  persistCapture: jest.fn(),
}))
jest.mock("@app/components/account-upgrade-flow", () => {
  const ReactActual = jest.requireActual("react")
  const { View } = jest.requireActual("react-native")
  return {
    CaptureOverlay: () => ReactActual.createElement(View, { testID: "capture-overlay" }),
    CapturePreview: () => ReactActual.createElement(View, { testID: "capture-preview" }),
  }
})

// --- the two QR scanners -----------------------------------------------------
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  }),
  useIsFocused: () => true,
}))
jest.mock("@app/graphql/generated", () => ({
  // Spread the real module: it also exports the enums the screens' own utils
  // read at import time (UpgradeEvidenceType, PhoneCodeChannelType).
  ...jest.requireActual("@app/graphql/generated"),
  useAccountDefaultWalletLazyQuery: () => [jest.fn()],
  useRealtimePriceQuery: () => ({ data: undefined }),
  useScanningQrCodeScreenQuery: () => ({ data: undefined }),
}))
jest.mock("@app/graphql/is-authed-context", () => ({ useIsAuthed: () => true }))
jest.mock("@app/hooks", () => ({
  useAppConfig: () => ({
    appConfig: { galoyInstance: { lnAddressHostname: "flashapp.me", name: "Main" } },
  }),
  useActivityIndicator: () => ({ toggleActivityIndicator: jest.fn() }),
}))
jest.mock("@app/screens/phone-auth-screen/request-phone-code-login", () => ({
  __esModule: true,
  ErrorType: {},
  RequestPhoneCodeStatus: { InputtingPhoneNumber: "InputtingPhoneNumber" },
  useRequestPhoneCodeLogin: () => ({
    submitPhoneNumber: jest.fn(),
    phoneInputInfo: undefined,
    status: "InputtingPhoneNumber",
    setStatus: jest.fn(),
    error: undefined,
    setPhoneNumber: jest.fn(),
    isSmsSupported: true,
    isWhatsAppSupported: true,
  }),
}))

loadLocale("en")
const en = i18nObject("en")

const renderInTheme = (node: React.ReactElement) =>
  render(<ThemeProvider theme={createTheme({})}>{node}</ThemeProvider>)

/**
 * React Native merges the mounted StatusBar stack per prop, last entry wins, so
 * the contract is "this tree contributes a light-content entry", not "every
 * entry is light-content".
 */
const declaresLightIcons = (tree: RenderAPI) =>
  tree
    .UNSAFE_getAllByType(StatusBar)
    .some((node) => node.props.barStyle === "light-content")

const navigation = () =>
  ({
    navigate: jest.fn(),
    push: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  } as never)

describe("full-bleed dark screens override the themed status-bar tint (ENG-609)", () => {
  it("IdentityCapture: light icons over the black camera screen", () => {
    const tree = renderInTheme(
      <IdentityCapture
        navigation={navigation()}
        route={{ key: "r", name: "IdentityCapture", params: { side: "front" } } as never}
      />,
    )

    // Sanity: this is the camera branch, i.e. the black full-bleed one.
    expect(tree.getByTestId("capture-overlay")).toBeTruthy()
    expect(declaresLightIcons(tree)).toBe(true)
  })

  it("ScanningQRCodeScreen: light icons over the black camera screen", () => {
    const tree = renderInTheme(<ScanningQRCodeScreen />)

    expect(tree.queryByText(en.ScanningQRCodeScreen.noCamera())).toBeNull()
    expect(declaresLightIcons(tree)).toBe(true)
  })

  it("SignInViaQRCode: light icons over the black camera screen", () => {
    const tree = renderInTheme(
      <SignInViaQRCode navigation={navigation()} route={{} as never} />,
    )

    expect(tree.queryByText(en.ScanningQRCodeScreen.noCamera())).toBeNull()
    expect(declaresLightIcons(tree)).toBe(true)
  })
})
