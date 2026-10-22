import { act, renderHook } from "@testing-library/react-native"
import { ApolloClient, InMemoryCache } from "@apollo/client"
import { createRecentFlashUsers } from "@app/assistant/ui/recent-flash-users"
import { useKnownFlashUsers } from "@app/assistant/ui/use-known-flash-users"

let mockContacts: string[] = []
let mockTags: string[][] = []
let mockHistory: unknown[] = []
const mockProfileMap = new Map()
const mockAddProfile = jest.fn()
const mockStore = { getLatest: jest.fn(), subscribe: jest.fn(() => jest.fn()) }
jest.mock("@app/graphql/generated", () => ({
  useContactsQuery: () => ({
    data: { me: { contacts: mockContacts.map((username) => ({ username })) } },
  }),
  useHomeAuthedQuery: () => ({
    data: { me: { defaultAccount: { transactions: { edges: mockHistory } } } },
  }),
}))
jest.mock("@app/hooks/use-connectivity", () => ({
  useConnectivity: () => ({ isOffline: false }),
}))
jest.mock("@app/screens/chat/chatContext", () => ({
  useChatContext: () => ({
    contactsEvent: { id: "contacts", tags: mockTags },
    profileMap: mockProfileMap,
    addEventToProfiles: mockAddProfile,
  }),
}))
jest.mock("@app/nostr/runtime/NostrRuntime", () => ({
  nostrRuntime: {
    getEventStore: () => mockStore,
    ensureSubscription: jest.fn(),
    releaseSubscription: jest.fn(),
  },
}))

it("collects Chat and payment-history names, retaining them when contacts are removed", () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    connectToDevTools: false,
  })
  const directory = createRecentFlashUsers(client, "account-host")
  mockTags = [["p", "chat-key"]]
  mockProfileMap.set("chat-key", { nip05: "dreadmax@flashapp.me" })
  mockContacts = ["alice"]
  mockHistory = [
    { node: { initiationVia: { counterPartyUsername: "bob" }, settlementVia: {} } },
  ]
  const hook = renderHook(() => useKnownFlashUsers("flashapp.me", directory))
  expect(hook.result.current).toEqual(
    expect.arrayContaining(["dreadmax", "alice", "bob"]),
  )
  act(() => {
    mockTags = []
    mockContacts = []
    mockHistory = []
  })
  hook.rerender({})
  expect(hook.result.current).toEqual(
    expect.arrayContaining(["dreadmax", "alice", "bob"]),
  )
  hook.unmount()
  const restored = createRecentFlashUsers(client, "account-host")
  const reopened = renderHook(() => useKnownFlashUsers("flashapp.me", restored))
  expect(reopened.result.current).toEqual(
    expect.arrayContaining(["dreadmax", "alice", "bob"]),
  )
  reopened.unmount()
})
