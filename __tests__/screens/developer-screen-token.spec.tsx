/**
 * ENG-634: the developer screen's access-token field.
 *
 * The card e2e flows sign in by typing a token into this field. An effect
 * resets the field when the selected instance changes: empty for another
 * instance, the stored token for the current one. It used to depend on the
 * instance OBJECT from the app config, so any re-render that handed over a
 * new object for the same instance re-ran it and overwrote whatever was being
 * typed with the stored token (empty on a fresh install). These specs pin the
 * reset to the instance id and the stored token.
 */
import * as React from "react"
import { fireEvent, render, screen } from "@testing-library/react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"

import { GALOY_INSTANCES, GaloyInstance } from "@app/config"
import { DeveloperScreen } from "../../app/screens/developer-screen/debug-screen"

const STORED_TOKEN = "ory_st_STOREDtoken000"
const TYPED_TOKEN = "ory_st_TYPEDtoken111"

const instance = (id: GaloyInstance["id"]): GaloyInstance => {
  const found = GALOY_INSTANCES.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`no instance ${id}`)
  return found
}

let mockAppConfig: { token: string; galoyInstance: GaloyInstance }

jest.mock("@app/hooks/use-app-config", () => ({
  useAppConfig: () => ({
    appConfig: mockAppConfig,
    saveToken: jest.fn(),
    saveTokenAndInstance: jest.fn(),
  }),
}))
jest.mock("@app/hooks", () => ({
  usePriceConversion: () => ({ usdPerSat: undefined }),
}))
jest.mock("@app/hooks/use-logout", () => ({
  __esModule: true,
  default: () => ({ logout: jest.fn() }),
}))
jest.mock("@app/hooks/use-tap-flashcard", () => ({
  useTapFlashcard: () => jest.fn(),
}))
jest.mock("@app/utils/cashu-card-bridge", () => ({
  getCardBridge: () => undefined,
  setCardBridge: jest.fn(),
}))
jest.mock("@app/utils/notifications", () => ({ addDeviceToken: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))
jest.mock("@app/graphql/client-only-query", () => ({ activateBeta: jest.fn() }))
jest.mock("@app/graphql/generated", () => ({
  useBetaQuery: () => ({ data: { beta: false } }),
  useLevelQuery: () => ({ data: undefined }),
}))
jest.mock("@apollo/client", () => ({ useApolloClient: () => ({}) }))
jest.mock("@react-native-firebase/crashlytics", () => ({
  getCrashlytics: () => ({ log: jest.fn(), crash: jest.fn() }),
}))
jest.mock("@react-native-clipboard/clipboard", () => ({ setString: jest.fn() }))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}))
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)

const theme = createTheme({})
const ui = () => (
  <ThemeProvider theme={theme}>
    <DeveloperScreen />
  </ThemeProvider>
)

const tokenField = () => screen.getByTestId("Input access token")

describe("DeveloperScreen access token field", () => {
  beforeEach(() => {
    mockAppConfig = { token: STORED_TOKEN, galoyInstance: instance("Test") }
  })

  it("keeps a typed token when the app config hands over a new object for the same instance", () => {
    const { rerender } = render(ui())
    fireEvent.changeText(tokenField(), TYPED_TOKEN)
    expect(tokenField().props.value).toBe(TYPED_TOKEN)

    // Same instance and stored token, new objects: what a context re-render
    // that rebuilds the config produces.
    mockAppConfig = { token: STORED_TOKEN, galoyInstance: { ...instance("Test") } }
    rerender(ui())

    expect(tokenField().props.value).toBe(TYPED_TOKEN)
  })

  it("empties the field for another instance and restores the stored token for the current one", () => {
    render(ui())
    expect(tokenField().props.value).toBe(STORED_TOKEN)

    fireEvent.press(screen.getAllByTestId("Main Button")[0])
    expect(tokenField().props.value).toBe("")

    fireEvent.press(screen.getAllByTestId("Test Button")[0])
    expect(tokenField().props.value).toBe(STORED_TOKEN)
  })

  it("follows a change of the stored token", () => {
    const { rerender } = render(ui())
    fireEvent.changeText(tokenField(), TYPED_TOKEN)

    mockAppConfig = { token: "ory_st_SAVEDtoken222", galoyInstance: instance("Test") }
    rerender(ui())

    expect(tokenField().props.value).toBe("ory_st_SAVEDtoken222")
  })
})
