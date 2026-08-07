import React from "react"
import { render } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"

// Mock i18n so LL.* resolves synchronously.
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({
    LL: {
      MyReferrals: {
        totalEarned: () => "Total earned",
        friendsJoined: () => "Friends joined",
        pendingCount: ({ count }: { count: number }) => `Pending rewards: ${count}`,
        earned: ({ amount }: { amount: string }) => `Joined — you earned ${amount}`,
        joinedRewardPending: () => "Joined — reward pending",
        joined: () => "Joined",
        invited: () => "Invited",
        expired: () => "Expired",
        empty: () => "No invites yet — invite a friend to get started.",
        loadFailed: () => "Couldn't load your referrals. Pull to retry.",
      },
    },
  }),
}))

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context")
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})

const mockUseMyReferralsQuery = jest.fn()
jest.mock("@app/graphql/generated", () => {
  const actual = jest.requireActual("@app/graphql/generated")
  return {
    InviteStatus: actual.InviteStatus,
    InviteMethod: actual.InviteMethod,
    useMyReferralsQuery: (...a: unknown[]) => mockUseMyReferralsQuery(...a),
  }
})

const mockUseReferralRewardFlag = jest.fn()
jest.mock("@app/hooks", () => ({
  useReferralRewardFlag: () => mockUseReferralRewardFlag(),
}))

import { MyReferrals } from "../MyReferrals"
import { InviteStatus, InviteMethod } from "@app/graphql/generated"

const invite = (over: Record<string, unknown>) => ({
  __typename: "MyReferralInvite",
  id: String(over.id ?? "i1"),
  contact: "friend@x.com",
  method: InviteMethod.Email,
  status: InviteStatus.Sent,
  createdAt: "2026-08-01T00:00:00.000Z",
  redeemedAt: null,
  myRewardCents: null,
  rewardPending: false,
  ...over,
})

const withData = (
  invites: unknown[],
  stats: Partial<{
    totalInvites: number
    acceptedCount: number
    totalEarnedCents: number
    pendingRewardCount: number
  }> = {},
) => {
  mockUseMyReferralsQuery.mockReturnValue({
    data: {
      myReferrals: {
        totalInvites: invites.length,
        acceptedCount: 0,
        totalEarnedCents: 0,
        pendingRewardCount: 0,
        ...stats,
        invites,
      },
    },
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  })
}

const renderScreen = () =>
  render(
    <ThemeProvider theme={theme}>
      <MyReferrals />
    </ThemeProvider>,
  )

describe("MyReferrals screen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseReferralRewardFlag.mockReturnValue({
      referralRewardEnabled: true,
      loading: false,
    })
  })

  it("shows total earnings and an earned row when rewards are enabled", () => {
    withData(
      [
        invite({
          id: "paid",
          status: InviteStatus.Accepted,
          myRewardCents: 500,
          contact: "bob@x.com",
        }),
      ],
      { totalEarnedCents: 500, acceptedCount: 1 },
    )
    const screen = renderScreen()
    expect(screen.getByText("Total earned")).toBeTruthy()
    expect(screen.getByText("$5.00")).toBeTruthy()
    expect(screen.getByText("Joined — you earned $5.00")).toBeTruthy()
  })

  it("shows a pending-reward row and the pending count", () => {
    withData([invite({ id: "p", status: InviteStatus.Accepted, rewardPending: true })], {
      pendingRewardCount: 1,
      acceptedCount: 1,
    })
    const screen = renderScreen()
    expect(screen.getByText("Joined — reward pending")).toBeTruthy()
    expect(screen.getByText("Pending rewards: 1")).toBeTruthy()
  })

  it("never renders money copy when rewards are disabled", () => {
    mockUseReferralRewardFlag.mockReturnValue({
      referralRewardEnabled: false,
      loading: false,
    })
    withData(
      [
        invite({
          id: "paid",
          status: InviteStatus.Accepted,
          myRewardCents: 500,
          rewardPending: false,
        }),
      ],
      { totalEarnedCents: 500, acceptedCount: 1 },
    )
    const screen = renderScreen()
    // Gated: joined-count header instead of earnings; row shows plain "Joined".
    expect(screen.getByText("Friends joined")).toBeTruthy()
    expect(screen.queryByText("Total earned")).toBeNull()
    expect(screen.queryByText(/earned/)).toBeNull()
    expect(screen.getByText("Joined")).toBeTruthy()
  })

  it("labels sent and expired invites as lifecycle rows", () => {
    withData([
      invite({ id: "s", status: InviteStatus.Sent, contact: "+18765550000" }),
      invite({ id: "e", status: InviteStatus.Expired, contact: "old@x.com" }),
    ])
    const screen = renderScreen()
    expect(screen.getByText("Invited")).toBeTruthy()
    expect(screen.getByText("Expired")).toBeTruthy()
  })

  it("shows the empty state when there are no invites", () => {
    withData([])
    const screen = renderScreen()
    expect(
      screen.getByText("No invites yet — invite a friend to get started."),
    ).toBeTruthy()
  })

  it("shows the failure message when the query errors with no cache", () => {
    mockUseMyReferralsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error("network"),
      refetch: jest.fn(),
    })
    const screen = renderScreen()
    expect(screen.getByText("Couldn't load your referrals. Pull to retry.")).toBeTruthy()
  })
})
