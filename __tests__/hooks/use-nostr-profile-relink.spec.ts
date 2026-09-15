/**
 * useNostrProfile.saveNewNostrKey — the relink path.
 *
 * Contract under test: when a local Nostr key already exists, generation is
 * unreachable. Whatever happens to the backend relink (success, refusal, a
 * rejected mutation), the keychain is never overwritten — every DM ever
 * encrypted to the existing key would otherwise become unreadable.
 *
 * The relink itself fires only for `unregistered` (backend npub null) and only
 * once `me` has loaded. `mismatch` is never repaired here: replacing a
 * registered npub is the user's decision (ensurer prompt / Reconnect), and
 * this path runs right after a username is set — seconds after they may have
 * declined.
 */
import { renderHook, act } from "@testing-library/react-hooks"
import * as Keychain from "react-native-keychain"
import { nip19 } from "nostr-tools"

const LOCAL_HEX = "a".repeat(64)
const LOCAL_NPUB = nip19.npubEncode(LOCAL_HEX)
const OTHER_NPUB = nip19.npubEncode("b".repeat(64))

const mockGetSigner = jest.fn()
const mockUserUpdateNpubMutation = jest.fn()
const mockEnsureContactListExists = jest.fn()
const mockGenerateSecretKey = jest.fn()
type MockMe = { npub?: string | null; username?: string | null } | null
// `undefined` = the network-only query has not returned yet.
let mockData: { me: MockMe } | undefined

jest.mock("nostr-tools", () => {
  const actual = jest.requireActual("nostr-tools")
  return {
    ...actual,
    generateSecretKey: () => mockGenerateSecretKey(),
  }
})

jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => true,
}))

jest.mock("@app/graphql/generated", () => ({
  useHomeAuthedQuery: () => ({ data: mockData }),
  useUserUpdateNpubMutation: () => [mockUserUpdateNpubMutation],
}))

jest.mock("@app/hooks/use-app-config", () => ({
  useAppConfig: () => ({
    appConfig: { galoyInstance: { lnAddressHostname: "flashapp.me" } },
  }),
}))

jest.mock("@app/utils/nostr", () => ({
  createContactListEvent: jest.fn(),
  ensureContactListExists: (...args: unknown[]) => mockEnsureContactListExists(...args),
  setPreferredRelay: jest.fn(),
}))

jest.mock("@app/nostr/signer", () => ({
  getSigner: () => mockGetSigner(),
  createSignerFromKey: jest.fn(),
  clearSigner: jest.fn(),
}))

jest.mock("@app/utils/nostr/publish-helpers", () => ({
  publishEventToRelays: jest.fn(),
  verifyEventOnRelays: jest.fn(),
  getPublishingRelays: () => [],
}))

jest.mock("@app/utils/nostr/pool", () => ({ pool: {} }))
jest.mock("@app/utils/nostr/image-generation", () => ({
  generateRoboHashAvatar: jest.fn(),
  generateGradientBanner: jest.fn(),
}))
jest.mock("@app/utils/nostr/media-upload", () => ({ uploadToNostrBuild: jest.fn() }))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const useNostrProfile = require("@app/hooks/use-nostr-profile").default

const existingSigner = { getPublicKey: async () => LOCAL_HEX }

/** The HomeAuthed query has returned with this `me`. */
const loaded = (me: MockMe) => {
  mockData = { me }
}

const saveNewNostrKey = async () => {
  const { result } = renderHook(() => useNostrProfile())
  let returned: unknown
  await act(async () => {
    returned = await result.current.saveNewNostrKey()
  })
  return returned
}

describe("useNostrProfile.saveNewNostrKey with an existing local key", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockData = undefined
    mockGetSigner.mockResolvedValue(existingSigner)
    mockEnsureContactListExists.mockResolvedValue(undefined)
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  it("registers the local key when the backend has none, without touching the keychain", async () => {
    loaded({ npub: null })
    mockUserUpdateNpubMutation.mockResolvedValue({
      data: { userUpdateNpub: { errors: [] } },
    })

    await saveNewNostrKey()

    expect(mockUserUpdateNpubMutation).toHaveBeenCalledTimes(1)
    expect(mockUserUpdateNpubMutation).toHaveBeenCalledWith({
      variables: { input: { npub: LOCAL_NPUB } },
    })
    expect(mockGenerateSecretKey).not.toHaveBeenCalled()
    expect(Keychain.setInternetCredentials).not.toHaveBeenCalled()
    expect(mockEnsureContactListExists).toHaveBeenCalledWith(existingSigner)
  })

  it("does not write to the backend when the local key is already linked", async () => {
    loaded({ npub: LOCAL_NPUB })

    await saveNewNostrKey()

    expect(mockUserUpdateNpubMutation).not.toHaveBeenCalled()
    expect(mockGenerateSecretKey).not.toHaveBeenCalled()
    expect(Keychain.setInternetCredentials).not.toHaveBeenCalled()
    expect(mockEnsureContactListExists).toHaveBeenCalledWith(existingSigner)
  })

  it("never regenerates when the relink mutation rejects", async () => {
    loaded({ npub: null })
    mockUserUpdateNpubMutation.mockRejectedValue(new Error("timeout"))

    await expect(saveNewNostrKey()).resolves.toBeUndefined()

    expect(mockUserUpdateNpubMutation).toHaveBeenCalledTimes(1)
    expect(mockGenerateSecretKey).not.toHaveBeenCalled()
    expect(Keychain.setInternetCredentials).not.toHaveBeenCalled()
    expect(mockEnsureContactListExists).toHaveBeenCalledWith(existingSigner)
  })

  it("never overwrites a registered npub that differs from the local key (mismatch)", async () => {
    // Phone registered K1; this device holds K2 and the user just declined
    // the ensurer prompt. Setting a username must not flip the account.
    loaded({ npub: OTHER_NPUB, username: "alice" })

    await saveNewNostrKey()

    expect(mockUserUpdateNpubMutation).not.toHaveBeenCalled()
    expect(mockGenerateSecretKey).not.toHaveBeenCalled()
    expect(Keychain.setInternetCredentials).not.toHaveBeenCalled()
    expect(mockEnsureContactListExists).toHaveBeenCalledWith(existingSigner)
  })

  it("does not relink while the backend query has not returned (me undefined)", async () => {
    // network-only query still in flight: an undefined backend npub is
    // unknown state, not "unregistered".
    mockData = undefined

    await saveNewNostrKey()

    expect(mockUserUpdateNpubMutation).not.toHaveBeenCalled()
    expect(mockGenerateSecretKey).not.toHaveBeenCalled()
    expect(Keychain.setInternetCredentials).not.toHaveBeenCalled()
    expect(mockEnsureContactListExists).toHaveBeenCalledWith(existingSigner)
  })

  it("never regenerates when the backend refuses the relink", async () => {
    loaded({ npub: null })
    mockUserUpdateNpubMutation.mockResolvedValue({
      data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
    })

    await saveNewNostrKey()

    expect(mockGenerateSecretKey).not.toHaveBeenCalled()
    expect(Keychain.setInternetCredentials).not.toHaveBeenCalled()
    expect(mockEnsureContactListExists).toHaveBeenCalledWith(existingSigner)
  })

  it("never regenerates when reading the existing key's pubkey fails", async () => {
    loaded({ npub: null })
    mockGetSigner.mockResolvedValue({
      getPublicKey: async () => {
        throw new Error("keychain locked")
      },
    })

    await saveNewNostrKey()

    expect(mockUserUpdateNpubMutation).not.toHaveBeenCalled()
    expect(mockGenerateSecretKey).not.toHaveBeenCalled()
    expect(Keychain.setInternetCredentials).not.toHaveBeenCalled()
  })
})
