import React from "react"
import { Alert, Linking } from "react-native"
import { render, waitFor } from "@testing-library/react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { redeemPendingInvite, useInviteDeepLink } from "../HandleInviteDeepLink"
import { InviteDeepLinkHandler } from "../InviteDeepLinkHandler"

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}))

// HandleInviteDeepLink pulls these generated hooks in at module load; the redeem
// mutation is passed explicitly into redeemPendingInvite, so stubs suffice.
const mockFetchPreview = jest.fn()
jest.mock("@app/graphql/generated", () => ({
  useRedeemInviteMutation: () => [jest.fn(), {}],
  useInvitePreviewLazyQuery: () => [mockFetchPreview, {}],
}))

const mockNavigate = jest.fn()
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}))

const mockUseIsAuthed = jest.fn()
jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => mockUseIsAuthed(),
}))

const asyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>

// Stored pending-invite records are JSON { token, storedAt }.
const storedInvite = (token: string, ageMs = 0) =>
  JSON.stringify({ token, storedAt: Date.now() - ageMs })

const validPreview = (method = "EMAIL") => ({
  data: {
    invitePreview: {
      isValid: true,
      contact: method === "EMAIL" ? "friend@example.com" : "+18765550000",
      method,
      inviterUsername: "alice",
    },
  },
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Alert, "alert").mockImplementation(() => {})
})

describe("redeemPendingInvite", () => {
  it("no-ops when there is no pending token", async () => {
    asyncStorage.getItem.mockResolvedValue(null)
    const redeem = jest.fn()

    const result = await redeemPendingInvite(redeem)

    expect(result).toEqual({ success: false, message: "No pending invite" })
    expect(redeem).not.toHaveBeenCalled()
    expect(asyncStorage.removeItem).not.toHaveBeenCalled()
  })

  it("redeems a stored token, clears it, and alerts on success", async () => {
    asyncStorage.getItem.mockResolvedValue(storedInvite("tok-123"))
    const redeem = jest
      .fn()
      .mockResolvedValue({ data: { redeemInvite: { success: true } } })

    const result = await redeemPendingInvite(redeem, true)

    expect(redeem).toHaveBeenCalledWith({ variables: { input: { token: "tok-123" } } })
    expect(asyncStorage.removeItem).toHaveBeenCalledWith("pendingInviteToken")
    expect(Alert.alert).toHaveBeenCalledWith(
      "Welcome!",
      expect.any(String),
      expect.any(Array),
    )
    expect(result).toEqual({ success: true, message: "Invite redeemed successfully" })
  })

  it("does not alert on success when showAlert is false", async () => {
    asyncStorage.getItem.mockResolvedValue(storedInvite("tok-123"))
    const redeem = jest
      .fn()
      .mockResolvedValue({ data: { redeemInvite: { success: true } } })

    const result = await redeemPendingInvite(redeem, false)

    expect(result.success).toBe(true)
    expect(Alert.alert).not.toHaveBeenCalled()
  })

  it("discards an expired stored token without calling the mutation", async () => {
    // Older than the 24h pending-invite TTL.
    asyncStorage.getItem.mockResolvedValue(storedInvite("tok-old", 25 * 60 * 60 * 1000))
    const redeem = jest.fn()

    const result = await redeemPendingInvite(redeem)

    expect(redeem).not.toHaveBeenCalled()
    expect(asyncStorage.removeItem).toHaveBeenCalledWith("pendingInviteToken")
    expect(result).toEqual({ success: false, message: "No pending invite" })
  })

  it("discards a malformed (pre-JSON legacy) stored value", async () => {
    asyncStorage.getItem.mockResolvedValue("raw-legacy-token")
    const redeem = jest.fn()

    const result = await redeemPendingInvite(redeem)

    expect(redeem).not.toHaveBeenCalled()
    expect(asyncStorage.removeItem).toHaveBeenCalledWith("pendingInviteToken")
    expect(result.success).toBe(false)
  })

  it("clears the token on a terminal error and shows a Notice", async () => {
    asyncStorage.getItem.mockResolvedValue(storedInvite("tok-123"))
    const redeem = jest.fn().mockResolvedValue({
      data: {
        redeemInvite: { success: false, errors: ["This invitation has expired"] },
      },
    })

    const result = await redeemPendingInvite(redeem, true)

    expect(asyncStorage.removeItem).toHaveBeenCalledWith("pendingInviteToken")
    expect(Alert.alert).toHaveBeenCalledWith("Notice", "This invitation has expired")
    expect(result).toEqual({ success: false, message: "This invitation has expired" })
  })

  it("keeps the token on a transient error", async () => {
    asyncStorage.getItem.mockResolvedValue(storedInvite("tok-123"))
    const redeem = jest.fn().mockResolvedValue({
      data: { redeemInvite: { success: false, errors: ["Something went wrong"] } },
    })

    const result = await redeemPendingInvite(redeem, true)

    expect(asyncStorage.removeItem).not.toHaveBeenCalled()
    expect(result).toEqual({ success: false, message: "Something went wrong" })
  })

  it("suppresses the alert for an already-used invite but clears the token", async () => {
    asyncStorage.getItem.mockResolvedValue(storedInvite("tok-123"))
    const redeem = jest.fn().mockResolvedValue({
      data: {
        redeemInvite: {
          success: false,
          errors: ["This invitation has already been used"],
        },
      },
    })

    const result = await redeemPendingInvite(redeem, true)

    expect(Alert.alert).not.toHaveBeenCalled()
    expect(asyncStorage.removeItem).toHaveBeenCalledWith("pendingInviteToken")
    expect(result.success).toBe(false)
  })

  it("silently clears the token for the one-reward-per-invitee rejection", async () => {
    // Emitted by the resolver's pre-check AND its duplicate-key race path —
    // permanent for this account, and not worth nagging the user about.
    asyncStorage.getItem.mockResolvedValue(storedInvite("tok-123"))
    const redeem = jest.fn().mockResolvedValue({
      data: {
        redeemInvite: {
          success: false,
          errors: ["You have already redeemed an invitation"],
        },
      },
    })

    const result = await redeemPendingInvite(redeem, true)

    expect(Alert.alert).not.toHaveBeenCalled()
    expect(asyncStorage.removeItem).toHaveBeenCalledWith("pendingInviteToken")
    expect(result.success).toBe(false)
  })

  it("clears the token for a revoked invite ('no longer valid')", async () => {
    asyncStorage.getItem.mockResolvedValue(storedInvite("tok-123"))
    const redeem = jest.fn().mockResolvedValue({
      data: {
        redeemInvite: {
          success: false,
          errors: ["This invitation is no longer valid"],
        },
      },
    })

    const result = await redeemPendingInvite(redeem, true)

    expect(asyncStorage.removeItem).toHaveBeenCalledWith("pendingInviteToken")
    expect(result.success).toBe(false)
  })

  it("clears the token for the resolver's 'new users only' terminal error", async () => {
    // Emitted by the GraphQL resolver (not the app layer): permanent for this
    // account, so the token must not be kept for a doomed retry.
    asyncStorage.getItem.mockResolvedValue(storedInvite("tok-123"))
    const redeem = jest.fn().mockResolvedValue({
      data: {
        redeemInvite: {
          success: false,
          errors: ["This invitation is for new users only"],
        },
      },
    })

    const result = await redeemPendingInvite(redeem, true)

    expect(asyncStorage.removeItem).toHaveBeenCalledWith("pendingInviteToken")
    expect(result.success).toBe(false)
  })

  it("keeps the token when the response has neither success nor errors", async () => {
    asyncStorage.getItem.mockResolvedValue(storedInvite("tok-123"))
    const redeem = jest.fn().mockResolvedValue({ data: { redeemInvite: {} } })

    const result = await redeemPendingInvite(redeem)

    expect(asyncStorage.removeItem).not.toHaveBeenCalled()
    expect(result).toEqual({ success: false, message: "Unknown error" })
  })

  it("keeps the token when the mutation throws (transient)", async () => {
    asyncStorage.getItem.mockResolvedValue(storedInvite("tok-123"))
    const redeem = jest.fn().mockRejectedValue(new Error("boom"))

    const result = await redeemPendingInvite(redeem)

    expect(asyncStorage.removeItem).not.toHaveBeenCalled()
    expect(result).toEqual({ success: false, message: "Error redeeming invite" })
  })

  it("only lets one concurrent redemption run (in-flight guard)", async () => {
    asyncStorage.getItem.mockResolvedValue(storedInvite("tok-123"))
    const redeem = jest
      .fn()
      .mockResolvedValue({ data: { redeemInvite: { success: true } } })

    const [first, second] = await Promise.all([
      redeemPendingInvite(redeem, false),
      redeemPendingInvite(redeem, false),
    ])

    expect(redeem).toHaveBeenCalledTimes(1)
    const messages = [first.message, second.message].sort()
    expect(messages).toContain("Invite redeemed successfully")
    expect(messages).toContain("Redemption already in progress")
  })
})

// Minimal host to exercise the effect in useInviteDeepLink.
const HookHost = () => {
  useInviteDeepLink()
  return null
}

describe("useInviteDeepLink", () => {
  beforeEach(() => {
    jest
      .spyOn(Linking, "addEventListener")
      .mockReturnValue({ remove: jest.fn() } as never)
  })

  it("ignores non-invite deep links", async () => {
    mockUseIsAuthed.mockReturnValue(false)
    jest.spyOn(Linking, "getInitialURL").mockResolvedValue("flash://home")

    render(<HookHost />)

    await waitFor(() => expect(Linking.getInitialURL).toHaveBeenCalled())
    expect(asyncStorage.setItem).not.toHaveBeenCalled()
    expect(mockFetchPreview).not.toHaveBeenCalled()
  })

  it("silently ignores an invite URL without a token", async () => {
    mockUseIsAuthed.mockReturnValue(false)
    jest.spyOn(Linking, "getInitialURL").mockResolvedValue("flash://invite")

    render(<HookHost />)

    await waitFor(() => expect(Linking.getInitialURL).toHaveBeenCalled())
    expect(asyncStorage.setItem).not.toHaveBeenCalled()
    expect(mockFetchPreview).not.toHaveBeenCalled()
    expect(Alert.alert).not.toHaveBeenCalled()
  })

  it("stores the token (JSON) and routes an unauthed EMAIL invite into the phone login flow", async () => {
    const token = "a".repeat(40)
    mockUseIsAuthed.mockReturnValue(false)
    jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue(`flash://invite?token=${token}`)
    mockFetchPreview.mockResolvedValue(validPreview("EMAIL"))

    render(<HookHost />)

    await waitFor(() =>
      expect(asyncStorage.setItem).toHaveBeenCalledWith(
        "pendingInviteToken",
        expect.stringContaining(`"token":"${token}"`),
      ),
    )
    expect(mockFetchPreview).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { token } }),
    )
    // No spoofable recipient header is sent — the backend ignores it.
    expect(mockFetchPreview.mock.calls[0][0]).not.toHaveProperty("context")
    // Invite channel and signup method are decoupled: an EMAIL invite routes
    // to PHONE signup (email signup does not exist), and redemption rides the
    // stored token after signup — same path as SMS/WhatsApp invites.
    await waitFor(
      () =>
        expect(mockNavigate).toHaveBeenCalledWith("phoneFlow", {
          screen: "phoneLoginInitiate",
        }),
      { timeout: 2000 },
    )
  })

  it("routes an unauthed WHATSAPP invite into the phone login flow", async () => {
    const token = "b".repeat(40)
    mockUseIsAuthed.mockReturnValue(false)
    jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue(`https://getflash.io/invite?token=${token}`)
    mockFetchPreview.mockResolvedValue(validPreview("WHATSAPP"))

    render(<HookHost />)

    await waitFor(
      () =>
        expect(mockNavigate).toHaveBeenCalledWith("phoneFlow", {
          screen: "phoneLoginInitiate",
        }),
      { timeout: 2000 },
    )
  })

  it("accepts tokens of any backend format, whole and URL-decoded", async () => {
    // 64-hex (e.g. sha256) and base64url-style tokens must not be truncated
    // or dropped by a client-side format assumption.
    const longToken = "c".repeat(64)
    mockUseIsAuthed.mockReturnValue(false)
    jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue(`flash://invite?token=${longToken}`)
    mockFetchPreview.mockResolvedValue(validPreview("EMAIL"))

    render(<HookHost />)

    await waitFor(() =>
      expect(mockFetchPreview).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { token: longToken } }),
      ),
    )
  })

  it("URL-decodes an encoded token", async () => {
    mockUseIsAuthed.mockReturnValue(false)
    jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue("flash://invite?token=abc%2Bdef_123")
    mockFetchPreview.mockResolvedValue(validPreview("EMAIL"))

    render(<HookHost />)

    await waitFor(() =>
      expect(mockFetchPreview).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { token: "abc+def_123" } }),
      ),
    )
  })

  it("falls back to the raw token when %-decoding fails (no crash)", async () => {
    mockUseIsAuthed.mockReturnValue(false)
    jest.spyOn(Linking, "getInitialURL").mockResolvedValue("flash://invite?token=%zz")
    mockFetchPreview.mockResolvedValue(validPreview("EMAIL"))

    render(<HookHost />)

    // decodeURIComponent("%zz") throws URIError; the raw captured value must
    // be passed through instead of an unhandled rejection.
    await waitFor(() =>
      expect(mockFetchPreview).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { token: "%zz" } }),
      ),
    )
  })

  it("keeps the stored token on a network error fetching the preview", async () => {
    const token = "g".repeat(40)
    mockUseIsAuthed.mockReturnValue(false)
    jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue(`flash://invite?token=${token}`)
    mockFetchPreview.mockResolvedValue({
      error: { networkError: new Error("offline") },
    })

    render(<HookHost />)

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Error",
        "Unable to fetch invitation details. Please try again.",
      ),
    )
    expect(asyncStorage.setItem).toHaveBeenCalled()
    expect(asyncStorage.removeItem).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("clears the stored token on a GraphQL error fetching the preview", async () => {
    const token = "h".repeat(40)
    mockUseIsAuthed.mockReturnValue(false)
    jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue(`flash://invite?token=${token}`)
    // The backend throws GraphQL errors for malformed/unknown tokens — a
    // retry can never succeed, so the doomed token must not linger.
    mockFetchPreview.mockResolvedValue({
      error: { graphQLErrors: [{ message: "Invalid or expired invitation" }] },
    })

    render(<HookHost />)

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Invalid Invitation",
        expect.any(String),
        expect.any(Array),
      ),
    )
    expect(asyncStorage.removeItem).toHaveBeenCalledWith("pendingInviteToken")
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("alerts an authed user without storing the token", async () => {
    const token = "d".repeat(40)
    mockUseIsAuthed.mockReturnValue(true)
    jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue(`flash://invite?token=${token}`)
    mockFetchPreview.mockResolvedValue(validPreview("EMAIL"))

    render(<HookHost />)

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Invitation for New Users",
        expect.any(String),
        expect.any(Array),
      ),
    )
    expect(asyncStorage.setItem).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("clears a stored token when the preview says the invite is invalid", async () => {
    const token = "e".repeat(40)
    mockUseIsAuthed.mockReturnValue(false)
    jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue(`flash://invite?token=${token}`)
    mockFetchPreview.mockResolvedValue({
      data: { invitePreview: { isValid: false } },
    })

    render(<HookHost />)

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Invalid Invitation",
        expect.any(String),
        expect.any(Array),
      ),
    )
    expect(asyncStorage.removeItem).toHaveBeenCalledWith("pendingInviteToken")
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("processes the launch URL exactly once across auth changes", async () => {
    const token = "f".repeat(40)
    mockUseIsAuthed.mockReturnValue(false)
    const getInitialURL = jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue(`flash://invite?token=${token}`)
    mockFetchPreview.mockResolvedValue(validPreview("EMAIL"))

    const { rerender } = render(<HookHost />)
    await waitFor(() => expect(asyncStorage.setItem).toHaveBeenCalledTimes(1))

    // Auth flips after onboarding — the launch URL must NOT be re-processed
    // (that would re-store the just-redeemed token and fire a bogus alert).
    mockUseIsAuthed.mockReturnValue(true)
    rerender(<HookHost />)

    await waitFor(() => expect(getInitialURL).toHaveBeenCalledTimes(1))
    expect(asyncStorage.setItem).toHaveBeenCalledTimes(1)
    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Invitation for New Users",
      expect.any(String),
      expect.any(Array),
    )
  })
})

describe("InviteDeepLinkHandler", () => {
  it("renders its children (and mounts the deep-link hook without throwing)", () => {
    mockUseIsAuthed.mockReturnValue(false)
    jest.spyOn(Linking, "getInitialURL").mockResolvedValue(null)
    jest
      .spyOn(Linking, "addEventListener")
      .mockReturnValue({ remove: jest.fn() } as never)

    const { toJSON } = render(
      <InviteDeepLinkHandler>
        <></>
      </InviteDeepLinkHandler>,
    )
    // children pass through (fragment renders null but no crash); hook effect ran
    expect(toJSON()).toBeNull()
    expect(Linking.getInitialURL).toHaveBeenCalled()
  })
})
