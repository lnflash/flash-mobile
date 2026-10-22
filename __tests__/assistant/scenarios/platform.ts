// The runtime's auth gate imports the biometric and key-store modules, as
// auth-gate.spec.ts mocks them; a text-initiated Confirm never prompts.
jest.mock("@app/assistant/ui/native-voice-input", () => ({
  nativeVoiceInput: {
    available: jest.fn(async () => true),
    permission: jest.fn(async () => "granted"),
    subscribe: jest.fn((_listener: unknown) => jest.fn()),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  },
}))
jest.mock("react-native-haptic-feedback", () => ({
  __esModule: true,
  default: { trigger: jest.fn() },
}))
jest.mock("react-native-fingerprint-scanner", () => ({
  __esModule: true,
  default: { isSensorAvailable: jest.fn(), authenticate: jest.fn(), release: jest.fn() },
}))
jest.mock("react-native-secure-key-store", () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
  ACCESSIBLE: {},
}))
const mockNavigate = jest.fn()
const mockOpenSupportChat = jest.fn()
jest.mock("@app/utils/nostr", () => ({
  ...jest.requireActual("@app/utils/nostr"),
  fetchNostrUsers: jest.fn(),
}))
jest.mock("nostr-tools", () => {
  const actual = jest.requireActual("nostr-tools")
  return {
    ...actual,
    nip05: { ...actual.nip05, queryProfile: jest.fn(async () => null) },
  }
})
let mockWalletEnabled = false
const mockWalletRequest = jest.fn(async (enabled: boolean) => {
  mockWalletEnabled = enabled
})
jest.mock("@app/hooks/use-bitcoin-wallet-mode", () => ({
  useBitcoinWalletMode: () => ({
    enabled: mockWalletEnabled,
    available: true,
    hasRecoveryPhrase: true,
    setupVisible: false,
    setSetupVisible: jest.fn(),
    request: mockWalletRequest,
  }),
}))
jest.mock("@app/store/persistent-state", () => ({
  ...jest.requireActual("@app/store/persistent-state"),
  usePersistentStateContext: () => ({
    persistentState: { isAdvanceMode: true, chatEnabled: true },
    updateState: jest.fn(),
  }),
}))
jest.mock("@app/components/advanced-mode-modal", () => ({
  AdvancedModeModal: () => null,
}))
jest.mock("@app/hooks/use-open-support-chat", () => ({
  useOpenSupportChat: () => mockOpenSupportChat,
}))
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native")
  const { useEffect } = jest.requireActual("react")
  return {
    ...actual,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    // The app's transaction row opens a payment's details.
    useNavigation: () => ({ navigate: mockNavigate }),
  }
})
jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en"), locale: "en" }) }
})
let mockOffline = false
jest.mock("@app/hooks/use-connectivity", () => ({
  useConnectivity: () => ({ isOffline: mockOffline, justReconnected: false }),
}))
jest.mock("@app/hooks/use-app-config", () => ({
  useAppConfig: () => ({
    appConfig: {
      token: "scenario-token",
      galoyInstance: {
        graphqlUri: "https://api.example/graphql",
        lnAddressHostname: "flashapp.me",
      },
    },
  }),
}))
// The app's formatter, written so a spec can predict it: "USD 1234", and
// "~ USD 1234" for a converted amount. The account's display currency is
// USD unless a case says otherwise.
let mockDisplay = { displayCurrency: "USD", fiatSymbol: "$" }
jest.mock("@app/hooks/use-display-currency", () => {
  const fmt = ({
    moneyAmount,
  }: {
    moneyAmount: { currencyCode: string; amount: number }
  }) => `${moneyAmount.currencyCode} ${moneyAmount.amount}`
  return {
    useDisplayCurrency: () => ({
      displayCurrency: mockDisplay.displayCurrency,
      fiatSymbol: mockDisplay.fiatSymbol,
      fractionDigits: 2,
      formatMoneyAmount: fmt,
      moneyAmountToDisplayCurrencyString: ({
        moneyAmount,
      }: {
        moneyAmount: { currencyCode: string; amount: number }
      }) => `~ ${fmt({ moneyAmount })}`,
      formatDisplayAndWalletAmount: ({ displayAmount }: { displayAmount: never }) =>
        fmt({ moneyAmount: displayAmount }),
      formatCurrency: ({
        amountInMajorUnits,
        currency,
      }: {
        amountInMajorUnits: number
        currency: string
      }) => `${currency} ${amountInMajorUnits}`,
    }),
  }
})
jest.mock("@app/hooks/use-keyboard-padding", () => {
  const { View } = jest.requireActual("react-native")
  return { Animated: { View }, useKeyboardPaddingStyle: () => ({}) }
})
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context")
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})
let mockRuntime: unknown
jest.mock("@app/assistant/ui/assistant-runtime", () => ({
  ...jest.requireActual("@app/assistant/ui/assistant-runtime"),
  getAssistantRuntime: () => mockRuntime,
}))

const mockOwnPubkey = "1".repeat(64)
let mockChat = {
  contactsEvent: undefined as import("nostr-tools").Event | undefined,
  profileMap: new Map<string, unknown>(),
}
const mockChatListeners = new Set<() => void>()
const mockChatSubscribe = (listener: () => void) => {
  mockChatListeners.add(listener)
  return () => {
    mockChatListeners.delete(listener)
  }
}
const mockPublish = jest.fn((..._args: unknown[]) => [Promise.resolve("accepted")])
jest.mock("@app/utils/nostr/pool", () => ({
  pool: { publish: (...args: unknown[]) => mockPublish(...args) },
}))
jest.mock("@app/nostr/signer", () => ({
  getSigner: async () => ({
    getPublicKey: async () => mockOwnPubkey,
    signEvent: async (event: object) => ({
      ...event,
      id: "signed-scenario-contact",
      pubkey: mockOwnPubkey,
      sig: "0".repeat(128),
    }),
  }),
}))
jest.mock("@app/screens/chat/chatContext", () => ({
  useChatContext: () => {
    const { useSyncExternalStore } = jest.requireActual("react")
    const state = useSyncExternalStore(mockChatSubscribe, () => mockChat)
    return {
      ...state,
      userPublicKey: mockOwnPubkey,
      addEventToProfiles: () => undefined,
      setContactsEvent: (contactsEvent: import("nostr-tools").Event) => {
        mockChat = { ...mockChat, contactsEvent }
        mockChatListeners.forEach((listener) => listener())
      },
    }
  },
}))
const mockEventStore = { getLatest: () => undefined, subscribe: () => () => undefined }
jest.mock("@app/nostr/runtime/NostrRuntime", () => ({
  nostrRuntime: {
    getEventStore: () => mockEventStore,
    ensureSubscription: () => undefined,
    releaseSubscription: () => undefined,
  },
}))
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
)

export const platform = {
  setRuntime: (runtime: unknown) => {
    mockRuntime = runtime
  },
  setOffline: (offline: boolean) => {
    mockOffline = offline
  },
  setDisplay: (currency: "USD" | "JMD") => {
    mockDisplay = {
      displayCurrency: currency,
      fiatSymbol: currency === "JMD" ? "J$" : "$",
    }
  },
  setChat: (state: typeof mockChat) => {
    mockChat = state
    mockChatListeners.forEach((listener) => listener())
  },
  chat: () => mockChat,
  publish: mockPublish,
  openSupport: mockOpenSupportChat,
  navigate: mockNavigate,
  walletRequest: mockWalletRequest,
  ownPubkey: mockOwnPubkey,
  reset: () => {
    jest.clearAllMocks()
    mockOffline = false
    mockWalletEnabled = false
    mockChatListeners.clear()
  },
}
