/**
 * ENG-516 — useAccountStatus source selection.
 *
 * The derivation math is covered in account-status-derivation.spec.ts; this
 * covers the wiring decision that every status surface depends on: backend
 * `statusHeadline`/`capabilities` must take precedence over the level+KYC
 * fallback, and the fallback must engage only when the backend lacks the
 * fields (pre lnflash/flash#452).
 */

import { renderHook } from "@testing-library/react-hooks"

const mockUseAccountStatusQuery = jest.fn()
const mockUseBridgeKycStatusQuery = jest.fn()
const mockUseLevel = jest.fn()

jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useAccountStatusQuery: (...args: unknown[]) => mockUseAccountStatusQuery(...args),
  useBridgeKycStatusQuery: (...args: unknown[]) => mockUseBridgeKycStatusQuery(...args),
}))

jest.mock("@app/graphql/level-context", () => ({
  ...jest.requireActual("@app/graphql/level-context"),
  useLevel: () => mockUseLevel(),
}))

jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => true,
}))

jest.mock("@app/config/feature-flags-context", () => ({
  useFeatureFlags: () => ({ bridgeTopupEnabled: true }),
}))

import { AccountLevel } from "@app/graphql/level-context"
import { useAccountStatus } from "@app/hooks/use-account-status"

describe("useAccountStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseBridgeKycStatusQuery.mockReturnValue({
      data: { bridgeKycStatus: "approved" },
    })
  })

  it("prefers backend statusHeadline + capabilities over the level fallback", () => {
    // Level ZERO and KYC approved would derive TRIAL + usdAccount:true —
    // the backend fields must win over both.
    mockUseLevel.mockReturnValue({ currentLevel: AccountLevel.Zero })
    mockUseAccountStatusQuery.mockReturnValue({
      loading: false,
      refetch: jest.fn(),
      data: {
        me: {
          defaultAccount: {
            id: "acct-1",
            statusHeadline: "BUSINESS",
            capabilities: {
              verified: true,
              bankPayout: true,
              business: true,
              usdAccount: false,
            },
          },
        },
      },
    })

    const { result } = renderHook(() => useAccountStatus())

    expect(result.current.statusHeadline).toBe("BUSINESS")
    expect(result.current.capabilities).toEqual({
      verified: true,
      bankPayout: true,
      business: true,
      usdAccount: false,
    })
  })

  it("falls back to level + Bridge KYC when the backend lacks the fields", () => {
    mockUseLevel.mockReturnValue({ currentLevel: AccountLevel.Two })
    mockUseAccountStatusQuery.mockReturnValue({
      loading: false,
      refetch: jest.fn(),
      data: { me: { defaultAccount: { id: "acct-1" } } },
    })

    const { result } = renderHook(() => useAccountStatus())

    expect(result.current.statusHeadline).toBe("VERIFIED")
    expect(result.current.capabilities).toEqual({
      verified: true,
      bankPayout: true,
      business: false,
      usdAccount: true,
    })
  })
})
