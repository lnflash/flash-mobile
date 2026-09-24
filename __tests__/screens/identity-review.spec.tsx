/**
 * ENG-608 — IdentityReview: the first screen that uploads anything.
 */
import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import IdentityReview from "../../app/screens/account-upgrade-flow/IdentityReview"
import type { IdentityState } from "@app/store/redux/slices/accountUpgradeSlice"

const mockNavigate = jest.fn()
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockUploadEvidence = jest.fn()
const mockSubmitAccountUpgrade = jest.fn()

let mockIdentity: IdentityState

jest.mock("@app/store/redux", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ accountUpgrade: { numOfSteps: 5, identity: mockIdentity } }),
  useAppDispatch: () => jest.fn(),
}))
jest.mock("@app/hooks", () => ({
  useAccountUpgrade: () => ({
    uploadEvidence: mockUploadEvidence,
    submitAccountUpgrade: mockSubmitAccountUpgrade,
  }),
}))
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

loadLocale("en")
const en = i18nObject("en")

const img = (side: string) => ({
  uri: `file:///tmp/${side}.jpg`,
  width: 4032,
  height: 3024,
  fileName: `${side}.jpg`,
  type: "image/jpeg",
})

const full = (): IdentityState => ({
  documentType: "national_id",
  issuingCountry: "JM",
  front: img("front"),
  back: img("back"),
  selfie: img("selfie"),
  uploaded: {},
})

const renderReview = (params?: { resubmit?: boolean }) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <IdentityReview
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigation={
          { navigate: mockNavigate, push: mockPush, replace: mockReplace } as any
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        route={{ key: "r", name: "IdentityReview", params } as any}
      />
    </ThemeProvider>,
  )

beforeEach(() => {
  jest.clearAllMocks()
  mockIdentity = full()
})

describe("IdentityReview", () => {
  it("renders a thumbnail for each of the three captures", () => {
    const { getByTestId } = renderReview()
    expect(getByTestId("identity-thumb-front")).toBeTruthy()
    expect(getByTestId("identity-thumb-back")).toBeTruthy()
    expect(getByTestId("identity-thumb-selfie")).toBeTruthy()
  })

  it("shows only front and selfie for a passport", () => {
    mockIdentity = { ...full(), documentType: "passport", back: undefined }
    const { queryByTestId } = renderReview()
    expect(queryByTestId("identity-review-front")).toBeTruthy()
    expect(queryByTestId("identity-review-back")).toBeNull()
    expect(queryByTestId("identity-review-selfie")).toBeTruthy()
  })

  it("disables confirm until every capture is present and uploads nothing", () => {
    mockIdentity = { ...full(), selfie: undefined }
    const { getAllByText } = renderReview()

    const btn = getAllByText(en.AccountUpgrade.confirmContinue())[0]
    expect(getAllByText(en.AccountUpgrade.reviewMissing()).length).toBeGreaterThan(0)
    fireEvent.press(btn)

    expect(mockUploadEvidence).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("retake on a side opens the capture screen for that side and comes back here", () => {
    const { getByTestId } = renderReview()
    fireEvent.press(getByTestId("identity-edit-back"))
    expect(mockPush).toHaveBeenCalledWith("IdentityCapture", {
      side: "back",
      resubmit: false,
      returnToReview: true,
    })
  })

  it("confirm uploads first and only then moves on to business information", async () => {
    mockUploadEvidence.mockResolvedValue({ success: true, uploaded: {} })
    const { getAllByText } = renderReview()

    await act(async () => {
      fireEvent.press(getAllByText(en.AccountUpgrade.confirmContinue())[0])
    })

    await waitFor(() => expect(mockUploadEvidence).toHaveBeenCalledTimes(1))
    expect(mockNavigate).toHaveBeenCalledWith("BusinessInformation")
    expect(mockSubmitAccountUpgrade).not.toHaveBeenCalled()
  })

  it("a partial upload failure stays on the screen with a retry, marking the failed side", async () => {
    mockUploadEvidence.mockResolvedValue({
      success: false,
      failedSide: "selfie",
      error: "Network error during upload",
    })
    const { getAllByText, getByTestId } = renderReview()

    await act(async () => {
      fireEvent.press(getAllByText(en.AccountUpgrade.confirmContinue())[0])
    })

    await waitFor(() => expect(getByTestId("identity-review-error")).toBeTruthy())
    expect(getAllByText(en.AccountUpgrade.uploadFailed()).length).toBeGreaterThan(0)
    expect(getAllByText(en.AccountUpgrade.uploadRetry()).length).toBeGreaterThan(0)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("on a resubmit, confirm submits the whole request and lands on success", async () => {
    mockSubmitAccountUpgrade.mockResolvedValue({ success: true })
    const { getAllByText } = renderReview({ resubmit: true })

    await act(async () => {
      fireEvent.press(getAllByText(en.AccountUpgrade.confirmSubmit())[0])
    })

    await waitFor(() => expect(mockSubmitAccountUpgrade).toHaveBeenCalledTimes(1))
    expect(mockReplace).toHaveBeenCalledWith("AccountUpgradeSuccess", {
      resubmitted: true,
    })
  })
})
