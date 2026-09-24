/**
 * ENG-608 — IdentityReview: the first screen that uploads anything.
 */
import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import IdentityReview from "../../app/screens/account-upgrade-flow/IdentityReview"

type ScreenProps = React.ComponentProps<typeof IdentityReview>
import type { IdentityState } from "@app/store/redux/slices/accountUpgradeSlice"

const mockNavigate = jest.fn()
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockUploadEvidence = jest.fn()
const mockSubmitAccountUpgrade = jest.fn()
const mockDispatch = jest.fn()
const mockFileExists = jest.fn()

let mockIdentity: IdentityState

jest.mock("@app/store/redux", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ accountUpgrade: { numOfSteps: 5, identity: mockIdentity } }),
  useAppDispatch: () => mockDispatch,
}))
jest.mock("@app/utils/identity-files", () => ({
  identityFileExists: (path: string) => mockFileExists(path),
  identityFileUri: (path: string) => `file:///documents/${path}`,
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
  path: `idv/${side}-1.jpg`,
  width: 4032,
  height: 3024,
  fileName: `${side}.jpg`,
  type: "image/jpeg",
})

const full = (): IdentityState => ({
  documentType: "national_id",
  front: img("front"),
  back: img("back"),
  selfie: img("selfie"),
  uploaded: {},
})

const renderReview = (params?: { resubmit?: boolean }) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <IdentityReview
        navigation={
          {
            navigate: mockNavigate,
            push: mockPush,
            replace: mockReplace,
          } as unknown as ScreenProps["navigation"]
        }
        route={
          { key: "r", name: "IdentityReview", params } as unknown as ScreenProps["route"]
        }
      />
    </ThemeProvider>,
  )

beforeEach(() => {
  jest.clearAllMocks()
  mockIdentity = full()
  mockFileExists.mockResolvedValue(true)
})

describe("IdentityReview", () => {
  it("renders a thumbnail for each of the three captures", () => {
    const { getByTestId } = renderReview()
    expect(getByTestId("identity-thumb-front")).toBeTruthy()
    expect(getByTestId("identity-thumb-back")).toBeTruthy()
    expect(getByTestId("identity-thumb-selfie")).toBeTruthy()
  })

  it("resolves thumbnails from the document directory, not a stored absolute path", () => {
    // The slice holds `idv/<side>-<ts>.jpg`; the absolute container path is
    // rebuilt at read time because iOS changes it on every app update.
    const { getByTestId } = renderReview()
    expect(getByTestId("identity-thumb-front").props.source).toEqual({
      uri: "file:///documents/idv/front-1.jpg",
    })
  })

  it("forgets a side whose file is gone from disk when the screen opens", async () => {
    // The persisted state can outlive the file (temp purge, app update). With
    // the path still in the slice the card looked complete, confirm enabled,
    // and the upload failed on ENOENT every time.
    mockFileExists.mockImplementation((path: string) =>
      Promise.resolve(!path.startsWith("idv/back")),
    )
    renderReview()

    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "accountUpgrade/clearIdentityCapture",
        payload: { side: "back" },
      }),
    )
    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockFileExists).toHaveBeenCalledTimes(3)
  })

  it("leaves the state alone when every file is present", async () => {
    renderReview()
    await waitFor(() => expect(mockFileExists).toHaveBeenCalledTimes(3))
    expect(mockDispatch).not.toHaveBeenCalled()
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
      reason: "network",
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
    // A network blip is not the photo's fault: the capture is kept for retry.
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "accountUpgrade/clearIdentityCapture" }),
    )
  })

  it("a dead file says so and forgets that side instead of a generic retry loop", async () => {
    // Before: `res.error` ("Could not read the photo. Please take it again.")
    // was thrown away for the generic "did not upload" line, the capture stayed
    // in the slice, and Try again failed identically forever.
    mockUploadEvidence.mockResolvedValue({
      success: false,
      failedSide: "back",
      reason: "file",
      error: "Could not read the photo. Please take it again.",
    })
    const { getAllByText, getByTestId, queryAllByText } = renderReview()

    await act(async () => {
      fireEvent.press(getAllByText(en.AccountUpgrade.confirmContinue())[0])
    })

    await waitFor(() => expect(getByTestId("identity-review-error")).toBeTruthy())
    expect(getAllByText("Could not read the photo. Please take it again.")).toHaveLength(
      1,
    )
    expect(queryAllByText(en.AccountUpgrade.uploadFailed())).toHaveLength(0)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: "accountUpgrade/clearIdentityCapture",
      payload: { side: "back" },
    })
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

  it("on a resubmit, a dead file forgets that side instead of leaving Try again armed", async () => {
    // submitAccountUpgrade used to flatten the upload failure to `errors`
    // only, so a file-reason failure (unreadable still, rejected type) between
    // mount and confirm showed the message but kept the side in the slice and
    // confirm enabled; Try again then failed identically.
    mockSubmitAccountUpgrade.mockResolvedValue({
      success: false,
      errors: ["Could not read the photo. Please take it again."],
      failedSide: "front",
      reason: "file",
    })
    const { getAllByText, getByTestId, queryAllByText } = renderReview({
      resubmit: true,
    })

    await act(async () => {
      fireEvent.press(getAllByText(en.AccountUpgrade.confirmSubmit())[0])
    })

    await waitFor(() => expect(getByTestId("identity-review-error")).toBeTruthy())
    expect(getAllByText("Could not read the photo. Please take it again.")).toHaveLength(
      1,
    )
    expect(queryAllByText(en.AccountUpgrade.uploadFailed())).toHaveLength(0)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: "accountUpgrade/clearIdentityCapture",
      payload: { side: "front" },
    })
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockUploadEvidence).not.toHaveBeenCalled()
  })

  it("on a resubmit, a network failure keeps the capture and marks the side for retry", async () => {
    mockSubmitAccountUpgrade.mockResolvedValue({
      success: false,
      errors: ["Network error during upload"],
      failedSide: "selfie",
      reason: "network",
    })
    const { getAllByText, getByTestId } = renderReview({ resubmit: true })

    await act(async () => {
      fireEvent.press(getAllByText(en.AccountUpgrade.confirmSubmit())[0])
    })

    await waitFor(() => expect(getByTestId("identity-review-error")).toBeTruthy())
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "accountUpgrade/clearIdentityCapture" }),
    )
  })
})
