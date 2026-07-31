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
const mockRedeem = jest.fn()
const mockFetchPreview = jest.fn()
jest.mock("@app/graphql/generated", () => ({
  useRedeemInviteMutation: () => [mockRedeem, {}],
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
    asyncStorage.getItem.mockResolvedValue("tok-123")
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
    asyncStorage.getItem.mockResolvedValue("tok-123")
    const redeem = jest
      .fn()
      .mockResolvedValue({ data: { redeemInvite: { success: true } } })

    const result = await redeemPendingInvite(redeem, false)

    expect(result.success).toBe(true)
    expect(Alert.alert).not.toHaveBeenCalled()
  })

  it("surfaces a non-duplicate error via a Notice alert", async () => {
    asyncStorage.getItem.mockResolvedValue("tok-123")
    const redeem = jest.fn().mockResolvedValue({
      data: { redeemInvite: { success: false, errors: ["Invite expired"] } },
    })

    const result = await redeemPendingInvite(redeem, true)

    expect(Alert.alert).toHaveBeenCalledWith("Notice", "Invite expired")
    expect(result).toEqual({ success: false, message: "Invite expired" })
  })

  it("suppresses the alert for an already-used invite", async () => {
    asyncStorage.getItem.mockResolvedValue("tok-123")
    const redeem = jest.fn().mockResolvedValue({
      data: {
        redeemInvite: { success: false, errors: ["This invite has already been used"] },
      },
    })

    const result = await redeemPendingInvite(redeem, true)

    expect(Alert.alert).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
  })

  it("returns a generic failure when the response has neither success nor errors", async () => {
    asyncStorage.getItem.mockResolvedValue("tok-123")
    const redeem = jest.fn().mockResolvedValue({ data: { redeemInvite: {} } })

    const result = await redeemPendingInvite(redeem)

    expect(result).toEqual({ success: false, message: "Unknown error" })
  })

  it("catches mutation errors gracefully", async () => {
    asyncStorage.getItem.mockResolvedValue("tok-123")
    const redeem = jest.fn().mockRejectedValue(new Error("boom"))

    const result = await redeemPendingInvite(redeem)

    expect(result).toEqual({ success: false, message: "Error redeeming invite" })
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

  it("stores the token and fetches a preview for a valid invite link", async () => {
    const token = "a".repeat(40)
    mockUseIsAuthed.mockReturnValue(false)
    jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue(`flash://invite?token=${token}`)
    mockFetchPreview.mockResolvedValue({
      data: {
        invitePreview: {
          isValid: true,
          contact: "friend@example.com",
          method: "EMAIL",
          inviterUsername: "alice",
        },
      },
    })

    render(<HookHost />)

    await waitFor(() =>
      expect(asyncStorage.setItem).toHaveBeenCalledWith("pendingInviteToken", token),
    )
    expect(mockFetchPreview).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { token } }),
    )
    // unauthed EMAIL invite routes into the email login flow (after a short delay)
    await waitFor(
      () =>
        expect(mockNavigate).toHaveBeenCalledWith(
          "emailLoginInitiate",
          expect.objectContaining({
            inviteToken: token,
            prefilledEmail: "friend@example.com",
          }),
        ),
      { timeout: 2000 },
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
