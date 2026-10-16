/**
 * ENG-720: the chat screen's zap button after a zap whose outcome is unknown.
 *
 * payLightningBreez answers a rejection from sdk.sendPayment itself with
 * outcomeUnknown, and sendZap passes it through. The payment may already have
 * left, and a retry fetches a fresh invoice from the LNURL callback, so it
 * would pay the recipient a second time. The screen shows the history message,
 * never the SDK's raw `error`, and leaves isZapping set, so the zap button
 * stays disabled until the screen remounts. Any other failure re-enables it,
 * as before.
 *
 * sendZap is a jest.fn here: what it answers for a rejection from
 * sdk.sendPayment is pinned in __tests__/utils/spark-pay-lightning.spec.ts.
 * The screen's nostr runtime, chat context and child components are stubbed
 * down to what a quick zap reads.
 */
import React from "react"
import { act, fireEvent, render } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import AsyncStorage from "@react-native-async-storage/async-storage"
import theme from "@app/rne-theme/theme"
import { CHECK_TRANSACTION_HISTORY_MESSAGE } from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import { sendZap } from "@app/utils/nostr/zap"
import { toastShow } from "@app/utils/toast"
import { MessagesScreen } from "../messages"

jest.mock("@app/utils/nostr/zap", () => ({ sendZap: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))
// The Breez wallet is behind sendZap's payInvoice, which sendZap's mock never
// calls.
jest.mock("@app/utils/breez-sdk/spark", () => ({
  breezSDKInitialized: true,
  payLightningBreez: jest.fn(),
}))
jest.mock("@app/graphql/generated", () => ({
  HomeAuthedDocument: {},
  useHomeAuthedQuery: () => ({ data: undefined }),
  useLnInvoicePaymentSendMutation: () => [jest.fn()],
}))
jest.mock("@app/hooks/use-app-config", () => ({
  useAppConfig: () => ({
    appConfig: { galoyInstance: { lnAddressHostname: "flashapp.me" } },
  }),
}))
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
}))
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context")
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})
jest.mock("../chatContext", () => ({
  useChatContext: () => ({
    rumors: [],
    setRumors: jest.fn(),
    reactions: new Map(),
    addOptimisticReaction: jest.fn(),
  }),
}))
// The recipient's profile, with the lightning address a zap pays.
jest.mock("@app/nostr/runtime/NostrRuntime", () => ({
  nostrRuntime: {
    getEventStore: () => ({
      getLatest: (key: string) =>
        key === `0:${"b".repeat(64)}`
          ? { content: JSON.stringify({ name: "Bob", lud16: "bob@example.com" }) }
          : undefined,
      subscribe: () => () => undefined,
    }),
    ensureSubscription: jest.fn(),
  },
}))
jest.mock("@app/nostr/signer", () => ({ getSigner: jest.fn() }))
jest.mock("@app/utils/nostr", () => ({
  getGroupId: (pubkeys: string[]) => [...pubkeys].sort().join(","),
  sendNip17Message: jest.fn(),
  sendReaction: jest.fn(),
}))
jest.mock("../utils", () => ({ updateLastSeen: jest.fn() }))
jest.mock("@app/hooks/use-keyboard-padding", () => {
  const { View } = jest.requireActual("react-native")
  return { Animated: { View }, useKeyboardPaddingStyle: () => ({}) }
})
// The message list, the composer and the zap modal are not what these tests
// assert.
jest.mock("../components/MessageBubble", () => ({ MessageBubble: () => null }))
jest.mock("../components/MessageInput", () => ({ MessageInput: () => null }))
jest.mock("@app/components/zaps/quick-zap-modal", () => ({ QuickZapModal: () => null }))

// The first render loads the screen's React Native and nostr stack; under
// `--runInBand` after other suites that can exceed the default 5s, as in
// import-nsec-form.spec.tsx.
jest.setTimeout(30000)

const ME = "a".repeat(64)
const BOB = "b".repeat(64)
const ZAP_BUTTON = "chat-zap-button"

const mockSendZap = sendZap as jest.MockedFunction<typeof sendZap>
const mockToastShow = toastShow as jest.MockedFunction<typeof toastShow>

// With a saved default amount, a tap on the zap button zaps at once.
const renderChat = async () => {
  await AsyncStorage.setItem("@default_zap_amount", "21")
  const utils = render(
    <ThemeProvider theme={theme}>
      <MessagesScreen userPubkey={ME} groupId={`${ME},${BOB}`} />
    </ThemeProvider>,
  )
  // Let the saved amount load.
  await act(async () => {})
  return utils
}

const tapZap = async (getByTestId: (testID: string) => unknown) => {
  await act(async () => {
    fireEvent.press(getByTestId(ZAP_BUTTON) as never)
  })
}

beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
})

describe("MessagesScreen zap button (ENG-720)", () => {
  it("shows the history message and stays disabled when the zap's outcome is unknown", async () => {
    mockSendZap.mockResolvedValue({
      success: false,
      error: "SdkError.SparkError",
      outcomeUnknown: true,
    })

    const { getByTestId } = await renderChat()
    await tapZap(getByTestId)

    expect(mockSendZap).toHaveBeenCalledTimes(1)
    expect(mockSendZap.mock.calls[0][0]).toMatchObject({
      recipientPubkey: BOB,
      lud16: "bob@example.com",
      amountSats: 21,
    })
    // The history message, and never the SDK's own.
    expect(mockToastShow.mock.calls).toEqual([
      [{ message: CHECK_TRANSACTION_HISTORY_MESSAGE, type: "error" }],
    ])
    expect(getByTestId(ZAP_BUTTON)).toBeDisabled()

    // The re-tap that would have fetched a fresh invoice and paid again.
    await tapZap(getByTestId)
    expect(mockSendZap).toHaveBeenCalledTimes(1)
  })

  it("re-enables the button after any other failure, so the next tap zaps again", async () => {
    mockSendZap.mockResolvedValue({ success: false, error: "Minimum is 10 sats" })

    const { getByTestId } = await renderChat()
    await tapZap(getByTestId)

    expect(mockToastShow.mock.calls).toEqual([
      [{ message: "Minimum is 10 sats", type: "error" }],
    ])
    expect(getByTestId(ZAP_BUTTON)).not.toBeDisabled()

    await tapZap(getByTestId)
    expect(mockSendZap).toHaveBeenCalledTimes(2)
  })
})
