/**
 * useAccountUpgrade loading the latest upgrade request into the form.
 *
 * A Bridge KYC upgrade (frappe-flash-admin bridge_kyc_upgrade) files an
 * approved Level 2 request the customer never filled in: empty address
 * strings, no bank account. The dispatched actions are run through the real
 * reducer, so these assert the form state the customer ends up with.
 */
import { renderHook } from "@testing-library/react-native"

import reducer from "@app/store/redux/slices/accountUpgradeSlice"

const mockDispatch = jest.fn()
let mockState: ReturnType<typeof reducer>
let mockLatest: unknown

jest.mock("@app/store/redux", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ accountUpgrade: mockState }),
}))
jest.mock("@app/hooks/useActivityIndicator", () => ({
  useActivityIndicator: () => ({ toggleActivityIndicator: jest.fn() }),
}))
jest.mock("@app/utils/file-sha256", () => ({ fileSha256Hex: jest.fn() }))
jest.mock("@app/utils/identity-files", () => ({
  identityFileExists: jest.fn(),
  identityFileUri: jest.fn(),
  removeIdentityFiles: jest.fn(),
}))
jest.mock("@app/graphql/generated", () => ({
  HomeAuthedDocument: {},
  UpgradeEvidenceType: { IdFront: "ID_FRONT", IdBack: "ID_BACK", Selfie: "SELFIE" },
  useAuthQuery: () => ({ data: { me: { phone: "+16065550123" } } }),
  useLatestAccountUpgradeRequestQuery: () => ({ data: mockLatest, refetch: jest.fn() }),
  useUserEmailRegistrationInitiateMutation: () => [jest.fn()],
  useIdDocumentUploadUrlGenerateMutation: () => [jest.fn()],
  useBusinessAccountUpgradeRequestMutation: () => [jest.fn()],
}))

import { useAccountUpgrade } from "@app/hooks/useAccountUpgrade"

const initial = reducer(undefined, { type: "@@init" })

const EMPTY_ADDRESS = {
  title: "",
  line1: "",
  line2: null,
  city: "",
  state: "",
  postalCode: null,
  country: "",
}

const latest = (status: string, overrides: Record<string, unknown> = {}) => ({
  latestAccountUpgradeRequest: {
    upgradeRequest: {
      address: EMPTY_ADDRESS,
      bankAccount: null,
      currentLevel: "ONE",
      requestedLevel: "TWO",
      fullName: "William Creech",
      terminalsRequested: 0,
      status: "Approved",
      phoneNumber: "+16065550123",
      email: "will@example.com",
      idDocument: false,
      verification: {
        status,
        reasonCode: "APPROVE_BRIDGE_KYC",
        reasonMessage: "Your identity was confirmed through your completed KYC.",
        reviewedAt: null,
      },
      ...overrides,
    },
  },
})

/** The slice state after every action the hook dispatched, from `mockState`. */
const resultingState = () =>
  mockDispatch.mock.calls.reduce((state, [action]) => reducer(state, action), mockState)

beforeEach(() => {
  mockDispatch.mockReset()
  mockState = initial
})

describe("useAccountUpgrade loading the latest request", () => {
  it("an approved request only updates the status, leaving a flow in progress alone", () => {
    mockState = {
      ...initial,
      accountType: "THREE",
      businessInfo: {
        ...initial.businessInfo,
        businessName: "Creech Hauling",
        line1: "1 Main St",
      },
    }
    mockLatest = latest("APPROVED")

    renderHook(() => useAccountUpgrade())

    const state = resultingState()
    expect(state.status).toBe("APPROVED")
    expect(state.reasonCode).toBe("APPROVE_BRIDGE_KYC")
    expect(state.accountType).toBe("THREE")
    expect(state.businessInfo).toEqual(mockState.businessInfo)
    expect(state.personalInfo).toEqual(mockState.personalInfo)
  })

  it("an empty address keeps the form's defaults instead of blanking them", () => {
    mockLatest = latest("MORE_INFO_NEEDED")

    renderHook(() => useAccountUpgrade())

    const state = resultingState()
    expect(state.accountType).toBe("TWO")
    expect(state.personalInfo.fullName).toBe("William Creech")
    expect(state.businessInfo).toEqual({ ...initial.businessInfo, terminalRequested: 0 })
    expect(state.businessInfo.country).toBe("Jamaica")
    expect(state.bankInfo).toEqual(initial.bankInfo)
  })

  it("a submitted address and bank account are still loaded", () => {
    mockLatest = latest("MORE_INFO_NEEDED", {
      address: {
        title: "Creech Hauling",
        line1: "1 Main St",
        line2: null,
        city: "Kingston",
        state: "St. Andrew",
        postalCode: null,
        country: "Jamaica",
      },
      bankAccount: {
        bankName: "NCB",
        bankBranch: "Half Way Tree",
        accountType: "Savings",
        currency: "JMD",
        accountNumber: "123456789",
      },
    })

    renderHook(() => useAccountUpgrade())

    const state = resultingState()
    expect(state.businessInfo).toMatchObject({
      businessName: "Creech Hauling",
      line1: "1 Main St",
      city: "Kingston",
      state: "St. Andrew",
      country: "Jamaica",
    })
    expect(state.bankInfo).toMatchObject({ bankName: "NCB", accountNumber: "123456789" })
  })
})
