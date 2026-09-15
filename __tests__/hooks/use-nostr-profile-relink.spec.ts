/**
 * useNostrProfile.saveNewNostrKey — the relink path.
 *
 * Contract under test: when a local Nostr key already exists, generation is
 * unreachable. Whatever happens to the backend relink (success, refusal, a
 * rejected mutation), the keychain is never overwritten — every DM ever
 * encrypted to the existing key would otherwise become unreadable.
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
let mockMe: { npub?: string | null; username?: string | null } | null = null

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
  useHomeAuthedQuery: () => ({ data: { me: mockMe } }),
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
    mockGetSigner.mockResolvedValue(existingSigner)
    mockEnsureContactListExists.mockResolvedValue(undefined)
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  it("registers the local key when the backend has none, without touching the keychain", async () => {
    mockMe = { npub: null }
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
    mockMe = { npub: LOCAL_NPUB }

    await saveNewNostrKey()

    expect(mockUserUpdateNpubMutation).not.toHaveBeenCalled()
    expect(mockGenerateSecretKey).not.toHaveBeenCalled()
    expect(Keychain.setInternetCredentials).not.toHaveBeenCalled()
    expect(mockEnsureContactListExists).toHaveBeenCalledWith(existingSigner)
  })

  it("never regenerates when the relink mutation rejects", async () => {
    mockMe = { npub: OTHER_NPUB }
    mockUserUpdateNpubMutation.mockRejectedValue(new Error("timeout"))

    await expect(saveNewNostrKey()).resolves.toBeUndefined()

    expect(mockGenerateSecretKey).not.toHaveBeenCalled()
    expect(Keychain.setInternetCredentials).not.toHaveBeenCalled()
    expect(mockEnsureContactListExists).toHaveBeenCalledWith(existingSigner)
  })

  it("never regenerates when the backend refuses the relink", async () => {
    mockMe = { npub: null }
    mockUserUpdateNpubMutation.mockResolvedValue({
      data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
    })

    await saveNewNostrKey()

    expect(mockGenerateSecretKey).not.toHaveBeenCalled()
    expect(Keychain.setInternetCredentials).not.toHaveBeenCalled()
    expect(mockEnsureContactListExists).toHaveBeenCalledWith(existingSigner)
  })

  it("never regenerates when reading the existing key's pubkey fails", async () => {
    mockMe = { npub: null }
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
