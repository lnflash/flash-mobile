/**
 * ENG-608 — useAccountUpgrade: the upload loop and the submit wiring.
 *
 * `planUploads` is unit-tested on its own; this covers the hook honouring it:
 * reuse of recorded keys, per-side bookkeeping, stop on first failure, the
 * partial-failure → no-submit invariant, and the `evidence[]` + legacy
 * `idDocument` the mutation receives.
 */
import { act, renderHook } from "@testing-library/react-native"

import type {
  CapturedImage,
  IdentityState,
  UploadedEvidence,
} from "@app/store/redux/slices/accountUpgradeSlice"

const mockDispatch = jest.fn()
const mockGenerateUploadUrl = jest.fn()
const mockRequestUpgrade = jest.fn()
const mockRegisterEmail = jest.fn()
const mockRefetch = jest.fn()
const mockSha256 = jest.fn()
const mockFileExists = jest.fn()
const mockRemoveFiles = jest.fn()
const mockToggleActivityIndicator = jest.fn()

let mockState: {
  accountType: string
  status?: string
  personalInfo: Record<string, unknown>
  businessInfo: Record<string, unknown>
  bankInfo: Record<string, unknown>
  identity: IdentityState
}

jest.mock("@app/store/redux", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ accountUpgrade: mockState }),
}))
jest.mock("@app/hooks/useActivityIndicator", () => ({
  useActivityIndicator: () => ({ toggleActivityIndicator: mockToggleActivityIndicator }),
}))
jest.mock("@app/utils/file-sha256", () => ({
  fileSha256Hex: (uri: string) => mockSha256(uri),
}))
jest.mock("@app/utils/identity-files", () => ({
  identityFileExists: (path: string) => mockFileExists(path),
  identityFileUri: (path: string) => `file:///documents/${path}`,
  removeIdentityFiles: (identity: unknown) => mockRemoveFiles(identity),
}))
jest.mock("@app/graphql/generated", () => ({
  HomeAuthedDocument: {},
  UpgradeEvidenceType: { IdFront: "ID_FRONT", IdBack: "ID_BACK", Selfie: "SELFIE" },
  useAuthQuery: () => ({
    data: {
      me: {
        phone: "+18765550100",
        username: "jane",
        email: { address: "jane@example.com" },
      },
    },
  }),
  useLatestAccountUpgradeRequestQuery: () => ({ data: undefined, refetch: mockRefetch }),
  useUserEmailRegistrationInitiateMutation: () => [mockRegisterEmail],
  useIdDocumentUploadUrlGenerateMutation: () => [mockGenerateUploadUrl],
  useBusinessAccountUpgradeRequestMutation: () => [mockRequestUpgrade],
}))

import { useAccountUpgrade } from "@app/hooks/useAccountUpgrade"

// --- fakes for the presigned PUT ------------------------------------------

type XhrInstance = {
  url: string
  status: number
  readyState: number
  onreadystatechange?: () => void
  onerror?: () => void
  open: jest.Mock
  setRequestHeader: jest.Mock
  send: jest.Mock
}

const xhrInstances: XhrInstance[] = []
let xhrStatusFor: (url: string) => number

class FakeXMLHttpRequest {
  status = 0
  readyState = 0
  onreadystatechange?: () => void
  onerror?: () => void
  url = ""
  open = jest.fn((_method: string, url: string) => {
    this.url = url
  })
  setRequestHeader = jest.fn()
  send = jest.fn(() => {
    this.status = xhrStatusFor(this.url)
    this.readyState = 4
    this.onreadystatechange?.()
  })
  constructor() {
    xhrInstances.push(this as unknown as XhrInstance)
  }
}

const img = (side: string): CapturedImage => ({
  path: `idv/${side}-1.jpg`,
  width: 4032,
  height: 3024,
  fileName: `${side}-1.jpg`,
  type: "image/jpeg",
})

const up = (side: string): UploadedEvidence => ({
  path: `idv/${side}-1.jpg`,
  fileKey: `id-documents/${side}-key`,
  sha256: `${side}hash`,
})

const fullState = (identity: Partial<IdentityState> = {}) => ({
  accountType: "TWO",
  status: undefined,
  personalInfo: { fullName: "Jane Doe", email: "jane@example.com" },
  businessInfo: {
    businessName: "Shop",
    line1: "12 Hope Road",
    city: "Kingston",
    state: "St. Andrew",
    country: "Jamaica",
    terminalRequested: false,
  },
  bankInfo: {},
  identity: {
    documentType: "national_id" as const,
    front: img("front"),
    back: img("back"),
    selfie: img("selfie"),
    uploaded: {},
    ...identity,
  },
})

const uploadedDispatches = () =>
  mockDispatch.mock.calls
    .map(([action]) => action)
    .filter((a) => a.type === "accountUpgrade/setIdentityUploaded")

beforeEach(() => {
  jest.clearAllMocks()
  xhrInstances.length = 0
  xhrStatusFor = () => 200
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).XMLHttpRequest = FakeXMLHttpRequest
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).fetch = jest.fn(() =>
    Promise.resolve({ blob: () => Promise.resolve({ size: 3 }) }),
  )
  mockState = fullState()
  mockFileExists.mockResolvedValue(true)
  mockRemoveFiles.mockResolvedValue(undefined)
  mockSha256.mockImplementation((uri: string) => {
    const side = /idv\/(\w+)-/.exec(uri)?.[1]
    return Promise.resolve(`${side}hash`)
  })
  mockGenerateUploadUrl.mockImplementation(({ variables }) => {
    const side = /^(\w+)-/.exec(variables.input.filename)?.[1]
    return Promise.resolve({
      data: {
        idDocumentUploadUrlGenerate: {
          uploadUrl: `https://s3.test/${side}`,
          fileKey: `id-documents/${side}-key`,
        },
      },
    })
  })
  mockRequestUpgrade.mockResolvedValue({
    data: { businessAccountUpgradeRequest: { id: "req-1", errors: [] } },
  })
  mockRefetch.mockResolvedValue(undefined)
})

describe("useAccountUpgrade — uploadEvidence", () => {
  it("uploads all three sides of a fresh set and records each key as it lands", async () => {
    const { result } = renderHook(() => useAccountUpgrade())

    let res: Awaited<ReturnType<typeof result.current.uploadEvidence>> | undefined
    await act(async () => {
      res = await result.current.uploadEvidence()
    })

    expect(res).toEqual({
      success: true,
      uploaded: { front: up("front"), back: up("back"), selfie: up("selfie") },
    })
    expect(mockGenerateUploadUrl).toHaveBeenCalledTimes(3)
    expect(xhrInstances.map((x) => x.url)).toEqual([
      "https://s3.test/front",
      "https://s3.test/back",
      "https://s3.test/selfie",
    ])
    expect(uploadedDispatches()).toEqual([
      {
        type: "accountUpgrade/setIdentityUploaded",
        payload: { side: "front", evidence: up("front") },
      },
      {
        type: "accountUpgrade/setIdentityUploaded",
        payload: { side: "back", evidence: up("back") },
      },
      {
        type: "accountUpgrade/setIdentityUploaded",
        payload: { side: "selfie", evidence: up("selfie") },
      },
    ])
  })

  it("reads and hashes the file from the document directory, not a stored absolute path", async () => {
    const { result } = renderHook(() => useAccountUpgrade())

    await act(async () => {
      await result.current.uploadEvidence()
    })

    expect(mockSha256).toHaveBeenCalledWith("file:///documents/idv/front-1.jpg")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((global as any).fetch).toHaveBeenCalledWith(
      "file:///documents/idv/front-1.jpg",
    )
  })

  it("sends the JPEG content type on the presigned PUT", async () => {
    mockState = fullState({ front: { ...img("front"), type: "image/jpg" } })
    const { result } = renderHook(() => useAccountUpgrade())

    await act(async () => {
      await result.current.uploadEvidence()
    })

    // Android's "image/jpg" is normalised (ENG-291) before asking for a URL
    // and on the PUT itself.
    expect(mockGenerateUploadUrl.mock.calls[0][0].variables.input.contentType).toBe(
      "image/jpeg",
    )
    expect(xhrInstances[0].setRequestHeader).toHaveBeenCalledWith(
      "Content-Type",
      "image/jpeg",
    )
  })

  it("skips a side whose recorded key still matches the local file", async () => {
    mockState = fullState({ uploaded: { front: up("front") } })
    const { result } = renderHook(() => useAccountUpgrade())

    let res: Awaited<ReturnType<typeof result.current.uploadEvidence>> | undefined
    await act(async () => {
      res = await result.current.uploadEvidence()
    })

    expect(mockGenerateUploadUrl).toHaveBeenCalledTimes(2)
    expect(
      mockGenerateUploadUrl.mock.calls.map((c) => c[0].variables.input.filename),
    ).toEqual(["back-1.jpg", "selfie-1.jpg"])
    expect(uploadedDispatches().map((a) => a.payload.side)).toEqual(["back", "selfie"])
    expect(res).toMatchObject({
      success: true,
      uploaded: { front: up("front"), back: up("back"), selfie: up("selfie") },
    })
  })

  it("re-sends a retaken side even though a key was recorded for it", async () => {
    mockState = fullState({
      uploaded: { front: { ...up("front"), path: "idv/front-0.jpg" } },
    })
    const { result } = renderHook(() => useAccountUpgrade())

    await act(async () => {
      await result.current.uploadEvidence()
    })

    expect(mockGenerateUploadUrl).toHaveBeenCalledTimes(3)
  })

  it("stops at the first failure, keeps what already landed, names the side", async () => {
    xhrStatusFor = (url) => (url.endsWith("/back") ? 500 : 200)
    const { result } = renderHook(() => useAccountUpgrade())

    let res: Awaited<ReturnType<typeof result.current.uploadEvidence>> | undefined
    await act(async () => {
      res = await result.current.uploadEvidence()
    })

    expect(res).toEqual({
      success: false,
      failedSide: "back",
      reason: "network",
      error: "Failed to upload photo. Please try again.",
    })
    // front's key was recorded before back failed, so a retry reuses it...
    expect(uploadedDispatches().map((a) => a.payload.side)).toEqual(["front"])
    // ...and the selfie was never attempted.
    expect(mockGenerateUploadUrl).toHaveBeenCalledTimes(2)
    expect(xhrInstances).toHaveLength(2)
  })

  it("reports a missing capture without touching the network", async () => {
    mockState = fullState({ selfie: undefined })
    const { result } = renderHook(() => useAccountUpgrade())

    let res: Awaited<ReturnType<typeof result.current.uploadEvidence>> | undefined
    await act(async () => {
      res = await result.current.uploadEvidence()
    })

    expect(res).toMatchObject({ success: false, failedSide: "selfie", reason: "file" })
    expect(mockGenerateUploadUrl).not.toHaveBeenCalled()
  })

  it("a file the OS has purged is a file problem, reported before any upload URL is requested", async () => {
    mockFileExists.mockImplementation((path: string) =>
      Promise.resolve(!path.startsWith("idv/selfie")),
    )
    const { result } = renderHook(() => useAccountUpgrade())

    let res: Awaited<ReturnType<typeof result.current.uploadEvidence>> | undefined
    await act(async () => {
      res = await result.current.uploadEvidence()
    })

    expect(res).toEqual({
      success: false,
      failedSide: "selfie",
      reason: "file",
      error: "Photo is missing. Please take it again.",
    })
    expect(mockGenerateUploadUrl).toHaveBeenCalledTimes(2)
  })

  it("an unreadable file is a file problem with the hook's own message", async () => {
    mockSha256.mockImplementation((uri: string) =>
      uri.includes("back") ? Promise.reject(new Error("ENOENT")) : Promise.resolve("h"),
    )
    const { result } = renderHook(() => useAccountUpgrade())

    let res: Awaited<ReturnType<typeof result.current.uploadEvidence>> | undefined
    await act(async () => {
      res = await result.current.uploadEvidence()
    })

    expect(res).toEqual({
      success: false,
      failedSide: "back",
      reason: "file",
      error: "Could not read the photo. Please take it again.",
    })
  })

  it("maps the backend's InvalidFileType to a retake, not a retry", async () => {
    mockGenerateUploadUrl.mockRejectedValueOnce(new Error("InvalidFileType: image/heic"))
    const { result } = renderHook(() => useAccountUpgrade())

    let res: Awaited<ReturnType<typeof result.current.uploadEvidence>> | undefined
    await act(async () => {
      res = await result.current.uploadEvidence()
    })

    expect(res).toEqual({
      success: false,
      failedSide: "front",
      reason: "file",
      error: "Unsupported file type. Please take the photo again.",
    })
  })

  it("a URL request that fails for any other reason is a network problem", async () => {
    mockGenerateUploadUrl.mockRejectedValueOnce(new Error("Network request failed"))
    const { result } = renderHook(() => useAccountUpgrade())

    let res: Awaited<ReturnType<typeof result.current.uploadEvidence>> | undefined
    await act(async () => {
      res = await result.current.uploadEvidence()
    })

    expect(res).toMatchObject({ success: false, failedSide: "front", reason: "network" })
  })
})

describe("useAccountUpgrade — submitAccountUpgrade", () => {
  it("never submits when an upload failed", async () => {
    xhrStatusFor = (url) => (url.endsWith("/back") ? 503 : 200)
    const { result } = renderHook(() => useAccountUpgrade())

    let res: { success: boolean; errors?: string[] } | undefined
    await act(async () => {
      res = await result.current.submitAccountUpgrade()
    })

    expect(res).toEqual({
      success: false,
      errors: ["Failed to upload photo. Please try again."],
    })
    expect(mockRequestUpgrade).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "accountUpgrade/resetIdentity" }),
    )
    expect(mockRemoveFiles).not.toHaveBeenCalled()
    expect(mockToggleActivityIndicator).toHaveBeenLastCalledWith(false)
  })

  it("sends evidence in front/back/selfie order with the front key as legacy idDocument", async () => {
    const { result } = renderHook(() => useAccountUpgrade())

    let res: { success: boolean; errors?: string[] } | undefined
    await act(async () => {
      res = await result.current.submitAccountUpgrade()
    })

    expect(res).toEqual({ success: true })
    expect(mockRequestUpgrade).toHaveBeenCalledTimes(1)
    const input = mockRequestUpgrade.mock.calls[0][0].variables.input
    expect(input.evidence).toEqual([
      {
        type: "ID_FRONT",
        fileKey: "id-documents/front-key",
        sha256: "fronthash",
        documentType: "national_id",
      },
      {
        type: "ID_BACK",
        fileKey: "id-documents/back-key",
        sha256: "backhash",
        documentType: "national_id",
      },
      { type: "SELFIE", fileKey: "id-documents/selfie-key", sha256: "selfiehash" },
    ])
    expect(input.idDocument).toBe("id-documents/front-key")
    expect(input.evidence[0]).not.toHaveProperty("issuingCountry")
    expect(input).toMatchObject({
      level: "TWO",
      fullName: "Jane Doe",
      address: {
        line1: "12 Hope Road",
        city: "Kingston",
        state: "St. Andrew",
        country: "Jamaica",
        title: "Shop",
      },
    })
  })

  it("mixes reused keys with fresh uploads in the same evidence list", async () => {
    mockState = fullState({
      uploaded: {
        front: { ...up("front"), fileKey: "id-documents/front-old", sha256: "old" },
      },
    })
    const { result } = renderHook(() => useAccountUpgrade())

    await act(async () => {
      await result.current.submitAccountUpgrade()
    })

    const input = mockRequestUpgrade.mock.calls[0][0].variables.input
    expect(input.evidence.map((e: { fileKey: string }) => e.fileKey)).toEqual([
      "id-documents/front-old",
      "id-documents/back-key",
      "id-documents/selfie-key",
    ])
    expect(input.idDocument).toBe("id-documents/front-old")
  })

  it("a passport sends two rows and no ID_BACK", async () => {
    mockState = fullState({ documentType: "passport", back: undefined })
    const { result } = renderHook(() => useAccountUpgrade())

    await act(async () => {
      await result.current.submitAccountUpgrade()
    })

    const input = mockRequestUpgrade.mock.calls[0][0].variables.input
    expect(input.evidence.map((e: { type: string }) => e.type)).toEqual([
      "ID_FRONT",
      "SELFIE",
    ])
  })

  it("after the request is on file, forgets the captures and deletes the stills", async () => {
    // Photos of a government ID have no reason to sit in the document
    // directory and AsyncStorage until logout.
    const { result } = renderHook(() => useAccountUpgrade())

    await act(async () => {
      await result.current.submitAccountUpgrade()
    })

    expect(mockDispatch).toHaveBeenCalledWith({
      type: "accountUpgrade/resetIdentity",
      payload: undefined,
    })
    expect(mockRemoveFiles).toHaveBeenCalledTimes(1)
    expect(mockRemoveFiles).toHaveBeenCalledWith(
      expect.objectContaining({ front: img("front"), selfie: img("selfie") }),
    )
    expect(mockDispatch).toHaveBeenCalledWith({
      type: "accountUpgrade/setAccountUpgrade",
      payload: { status: "SUBMITTED", reasonCode: undefined, reasonMessage: undefined },
    })
  })

  it("keeps the captures when the backend rejects the request", async () => {
    mockRequestUpgrade.mockResolvedValue({
      data: {
        businessAccountUpgradeRequest: {
          id: null,
          errors: [{ message: "Address could not be verified" }],
        },
      },
    })
    const { result } = renderHook(() => useAccountUpgrade())

    let res: { success: boolean; errors?: string[] } | undefined
    await act(async () => {
      res = await result.current.submitAccountUpgrade()
    })

    expect(res).toEqual({ success: false, errors: ["Address could not be verified"] })
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "accountUpgrade/resetIdentity" }),
    )
    expect(mockRemoveFiles).not.toHaveBeenCalled()
  })

  it("refuses to submit without a complete address, before uploading anything", async () => {
    mockState = {
      ...fullState(),
      businessInfo: { businessName: "Shop", city: "Kingston" },
    }
    const { result } = renderHook(() => useAccountUpgrade())

    let res: { success: boolean; errors?: string[] } | undefined
    await act(async () => {
      res = await result.current.submitAccountUpgrade()
    })

    expect(res).toEqual({
      success: false,
      errors: ["Please complete all address fields"],
    })
    expect(mockGenerateUploadUrl).not.toHaveBeenCalled()
    expect(mockRequestUpgrade).not.toHaveBeenCalled()
  })
})
