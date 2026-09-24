/**
 * ENG-608 — the upgrade-request status card on the capabilities hub and its
 * resubmit call to action.
 */
import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { fireEvent, render } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import AccountType from "../../app/screens/account-upgrade-flow/AccountType"

const mockNavigate = jest.fn()
const mockDispatch = jest.fn()

let mockStatus: string | undefined
let mockReasonMessage: string | undefined

jest.mock("@app/store/redux", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      accountUpgrade: {
        status: mockStatus,
        reasonMessage: mockReasonMessage,
        accountType: "TWO",
      },
    }),
  useAppDispatch: () => mockDispatch,
}))
jest.mock("@app/hooks/useAccountUpgrade", () => ({
  useAccountUpgrade: () => ({}),
}))
jest.mock("@app/hooks/use-account-status", () => ({
  useAccountStatus: () => ({
    statusHeadline: "VERIFIED",
    capabilities: {
      verified: true,
      bankPayout: false,
      business: false,
      usdAccount: false,
    },
    refetch: jest.fn(),
  }),
}))
jest.mock("@app/hooks/use-bridge-kyc", () => ({
  useBridgeKyc: () => ({
    bridgeTopupEnabled: false,
    bridgeKycStatus: undefined,
    refetchKycStatus: jest.fn(),
    kycModalVisible: false,
    startBridgeKyc: jest.fn(),
    closeKycModal: jest.fn(),
    submitBridgeKyc: jest.fn(),
  }),
}))
jest.mock("@app/graphql/level-context", () => ({
  ...jest.requireActual("@app/graphql/level-context"),
  useLevel: () => ({ currentLevel: "ONE" }),
}))
jest.mock("@app/components/topup-cashout-flow", () => ({
  BridgeKycModal: () => null,
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useFocusEffect: jest.fn(),
}))
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

loadLocale("en")
const en = i18nObject("en")

const renderHub = () =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <AccountType
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigation={{ navigate: mockNavigate } as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        route={{ key: "r", name: "AccountType" } as any}
      />
    </ThemeProvider>,
  )

beforeEach(() => {
  jest.clearAllMocks()
  mockStatus = undefined
  mockReasonMessage = undefined
})

describe("AccountType status card", () => {
  it("renders nothing when there is no upgrade request", () => {
    const { queryAllByText } = renderHub()
    expect(queryAllByText(en.AccountUpgrade.statusCardTitle())).toHaveLength(0)
  })

  const noCta = (status: string, label: string) => {
    mockStatus = status
    const { getAllByText, queryByTestId } = renderHub()
    expect(getAllByText(label).length).toBeGreaterThan(0)
    expect(queryByTestId("upgrade-status-resubmit")).toBeNull()
  }

  it("shows SUBMITTED without a call to action", () => {
    noCta("SUBMITTED", en.AccountUpgrade.statusSubmitted())
  })

  it("shows UNDER_REVIEW without a call to action", () => {
    noCta("UNDER_REVIEW", en.AccountUpgrade.statusUnderReview())
  })

  it("shows APPROVED without a call to action", () => {
    noCta("APPROVED", en.AccountUpgrade.statusApproved())
  })

  it("shows the reviewer's reason for a rejection", () => {
    mockStatus = "REJECTED"
    mockReasonMessage = "The name on the ID does not match the account."
    const { getAllByText, queryByTestId } = renderHub()
    expect(getAllByText(en.AccountUpgrade.statusRejected()).length).toBeGreaterThan(0)
    expect(
      getAllByText("The name on the ID does not match the account.").length,
    ).toBeGreaterThan(0)
    expect(queryByTestId("upgrade-status-resubmit")).toBeNull()
  })

  it("MORE_INFO_NEEDED shows the reason and a Resubmit CTA into the identity flow", () => {
    mockStatus = "MORE_INFO_NEEDED"
    mockReasonMessage = "The photo of your ID was blurry."
    const { getAllByText, getByTestId } = renderHub()

    expect(getAllByText(en.AccountUpgrade.statusMoreInfoNeeded()).length).toBeGreaterThan(
      0,
    )
    expect(getAllByText("The photo of your ID was blurry.").length).toBeGreaterThan(0)

    fireEvent.press(getByTestId("upgrade-status-resubmit"))

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { accountType: "TWO" } }),
    )
    expect(mockNavigate).toHaveBeenCalledWith("IdentityDocumentType", { resubmit: true })
  })

  it("falls back to the default copy when no reason was recorded", () => {
    mockStatus = "MORE_INFO_NEEDED"
    const { getAllByText } = renderHub()
    expect(
      getAllByText(en.AccountUpgrade.statusMoreInfoNeededDesc()).length,
    ).toBeGreaterThan(0)
  })

  it("a bank cash-out setup now has five steps for a verified account", () => {
    const { getAllByText } = renderHub()
    fireEvent.press(getAllByText(en.AccountUpgrade.bankCashoutTitle())[0])
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { accountType: "TWO", numOfSteps: 5 } }),
    )
    expect(mockNavigate).toHaveBeenCalledWith("PersonalInformation")
  })
})
