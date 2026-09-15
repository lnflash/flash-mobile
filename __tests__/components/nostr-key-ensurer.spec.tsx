/**
 * NostrKeyEnsurer — on every authenticated session start, the npub the backend
 * advertises for the account must be the key this device can decrypt with.
 *
 * Contract under test:
 *  - linked          → no backend write.
 *  - unregistered    → register the local key (the "flash" account case:
 *                      local key, backend npub null, so nobody can DM it).
 *  - mismatch        → re-register the local key (stale/duplicate-key case:
 *                      DMs were going to a key this device does not hold).
 *  - backend refuses → no chat re-init, no crash (NPUB_NOT_AVAILABLE).
 *  - conflict        → never auto-generate over a registered npub.
 *  - fresh           → generate, register, init chat.
 */
import React from "react"
import { render, waitFor } from "@testing-library/react-native"
import { nip19 } from "nostr-tools"

const mockUserUpdateNpub = jest.fn()
const mockInitializeChat = jest.fn()
const mockFetchSecret = jest.fn()
const mockGetSigner = jest.fn()
const mockGenerateAndStoreKey = jest.fn()
let mockMe: { npub?: string | null } | null = null

jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => true,
}))

jest.mock("@app/graphql/generated", () => ({
  useHomeAuthedQuery: () => ({ data: { me: mockMe } }),
  useUserUpdateNpubMutation: () => [mockUserUpdateNpub],
}))

jest.mock("@app/screens/chat/chatContext", () => ({
  useChatContext: () => ({ initializeChat: mockInitializeChat }),
}))

jest.mock("@app/utils/nostr", () => ({
  fetchSecretFromLocalStorage: () => mockFetchSecret(),
}))

jest.mock("@app/nostr/signer", () => ({
  getSigner: () => mockGetSigner(),
  generateAndStoreKey: () => mockGenerateAndStoreKey(),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const NostrKeyEnsurer = require("@app/components/nostr-key-ensurer").default

const LOCAL_HEX = "a".repeat(64)
const LOCAL_NPUB = nip19.npubEncode(LOCAL_HEX)
const OTHER_NPUB = nip19.npubEncode("b".repeat(64))

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

const withLocalKey = () => {
  mockFetchSecret.mockResolvedValue("nsec1local")
  mockGetSigner.mockResolvedValue({ getPublicKey: async () => LOCAL_HEX })
}

const okMutation = () =>
  mockUserUpdateNpub.mockResolvedValue({ data: { userUpdateNpub: { errors: [] } } })

describe("NostrKeyEnsurer", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockInitializeChat.mockResolvedValue(undefined)
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  it("does nothing when the local key matches the backend npub", async () => {
    withLocalKey()
    mockMe = { npub: LOCAL_NPUB }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockGetSigner).toHaveBeenCalled())
    expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
    expect(mockInitializeChat).not.toHaveBeenCalled()
  })

  it("registers the local key when the backend has no npub", async () => {
    withLocalKey()
    okMutation()
    mockMe = { npub: null }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockInitializeChat).toHaveBeenCalled())
    expect(mockUserUpdateNpub).toHaveBeenCalledWith({
      variables: { input: { npub: LOCAL_NPUB } },
    })
    expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
  })

  it("re-registers the local key when the backend advertises a different one", async () => {
    withLocalKey()
    okMutation()
    mockMe = { npub: OTHER_NPUB }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockInitializeChat).toHaveBeenCalled())
    expect(mockUserUpdateNpub).toHaveBeenCalledTimes(1)
    expect(mockUserUpdateNpub).toHaveBeenCalledWith({
      variables: { input: { npub: LOCAL_NPUB } },
    })
    expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
  })

  it("leaves things alone when the backend refuses the relink", async () => {
    withLocalKey()
    mockUserUpdateNpub.mockResolvedValue({
      data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
    })
    mockMe = { npub: OTHER_NPUB }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockUserUpdateNpub).toHaveBeenCalled())
    await flush()
    expect(mockInitializeChat).not.toHaveBeenCalled()
    expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
  })

  it("survives a rejected relink mutation", async () => {
    withLocalKey()
    mockUserUpdateNpub.mockRejectedValue(new Error("network"))
    mockMe = { npub: OTHER_NPUB }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockUserUpdateNpub).toHaveBeenCalled())
    await flush()
    expect(mockInitializeChat).not.toHaveBeenCalled()
  })

  it("never auto-generates over a registered npub when the device has no key", async () => {
    mockFetchSecret.mockResolvedValue(null)
    mockMe = { npub: OTHER_NPUB }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockFetchSecret).toHaveBeenCalled())
    await flush()
    expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
    expect(mockUserUpdateNpub).not.toHaveBeenCalled()
  })

  it("generates and registers a key when neither side has one", async () => {
    mockFetchSecret.mockResolvedValue(null)
    mockGenerateAndStoreKey.mockResolvedValue(LOCAL_NPUB)
    okMutation()
    mockMe = { npub: null }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockInitializeChat).toHaveBeenCalled())
    expect(mockGenerateAndStoreKey).toHaveBeenCalledTimes(1)
    expect(mockUserUpdateNpub).toHaveBeenCalledWith({
      variables: { input: { npub: LOCAL_NPUB } },
    })
  })
})
