import { AccountLevel } from "@app/graphql/generated"
import { createSlice, PayloadAction } from "@reduxjs/toolkit"
import { CountryCode } from "libphonenumber-js"

/** Free-form document kind sent as `UpgradeEvidenceInput.documentType`. */
export type IdentityDocumentType = "passport" | "national_id" | "drivers_licence"

/** Which capture the user is on. Passports have no back side. */
export type IdentitySide = "front" | "back" | "selfie"

/** A still taken in IdentityCapture, kept on disk until it is uploaded. */
export type CapturedImage = {
  uri: string
  width: number
  height: number
  fileName: string
  type: string
}

/**
 * A capture that already made it to storage. Keyed by the local `uri` so a
 * retake invalidates the key and a retry after a partial failure reuses it.
 */
export type UploadedEvidence = {
  uri: string
  fileKey: string
  sha256: string
}

/** Mirrors `AccountUpgradeVerificationStatus` in the public schema. */
export type UpgradeVerificationStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "MORE_INFO_NEEDED"
  | "APPROVED"
  | "REJECTED"

export type IdentityState = {
  documentType?: IdentityDocumentType
  issuingCountry: string
  front?: CapturedImage
  back?: CapturedImage
  selfie?: CapturedImage
  uploaded: Partial<Record<IdentitySide, UploadedEvidence>>
}

export interface AccountUpgradeSlice {
  accountType: AccountLevel
  status?: UpgradeVerificationStatus
  reasonCode?: string
  reasonMessage?: string
  personalInfo: {
    fullName?: string
    countryCode?: CountryCode
    phoneNumber?: string
    email?: string
  }
  businessInfo: {
    businessName?: string
    businessAddress?: string
    city?: string
    country?: string
    line1?: string
    line2?: string
    postalCode?: string
    state?: string
    terminalRequested: boolean
  }
  bankInfo: {
    bankName?: string
    bankBranch?: string
    bankAccountType?: string
    currency?: string
    accountNumber?: string
  }
  identity: IdentityState
  numOfSteps: number
  loading: boolean
  error?: string
}

export const initialIdentityState: IdentityState = {
  documentType: undefined,
  issuingCountry: "JM",
  front: undefined,
  back: undefined,
  selfie: undefined,
  uploaded: {},
}

const initialState: AccountUpgradeSlice = {
  accountType: "ONE",
  status: undefined,
  reasonCode: undefined,
  reasonMessage: undefined,
  personalInfo: {
    fullName: undefined,
    countryCode: "JM",
    phoneNumber: undefined,
    email: undefined,
  },
  businessInfo: {
    businessName: undefined,
    businessAddress: undefined,
    city: undefined,
    country: "Jamaica",
    line1: undefined,
    line2: undefined,
    postalCode: undefined,
    state: undefined,
    terminalRequested: false,
  },
  bankInfo: {
    bankName: undefined,
    bankBranch: undefined,
    bankAccountType: undefined,
    currency: undefined,
    accountNumber: undefined,
  },
  identity: initialIdentityState,
  numOfSteps: 3,
  loading: false,
  error: undefined,
}

export const accountUpgradeSlice = createSlice({
  name: "accountUpgrade",
  initialState,
  reducers: {
    setAccountUpgrade: (state, action) => ({
      ...state,
      ...action.payload,
    }),
    setPersonalInfo: (state, action) => ({
      ...state,
      personalInfo: { ...state.personalInfo, ...action.payload },
    }),
    setBusinessInfo: (state, action) => ({
      ...state,
      businessInfo: { ...state.businessInfo, ...action.payload },
    }),
    setBankInfo: (state, action) => ({
      ...state,
      bankInfo: { ...state.bankInfo, ...action.payload },
    }),
    setIdentity: (state, action: PayloadAction<Partial<IdentityState>>) => ({
      ...state,
      identity: { ...state.identity, ...action.payload },
    }),
    /**
     * Replace one side's capture. Any storage key recorded for that side is
     * dropped so the next upload sends the new file.
     */
    setIdentityCapture: (
      state,
      action: PayloadAction<{ side: IdentitySide; image: CapturedImage }>,
    ) => {
      const { side, image } = action.payload
      const uploaded = { ...state.identity.uploaded }
      delete uploaded[side]
      return {
        ...state,
        identity: { ...state.identity, [side]: image, uploaded },
      }
    },
    setIdentityUploaded: (
      state,
      action: PayloadAction<{ side: IdentitySide; evidence: UploadedEvidence }>,
    ) => ({
      ...state,
      identity: {
        ...state.identity,
        uploaded: {
          ...state.identity.uploaded,
          [action.payload.side]: action.payload.evidence,
        },
      },
    }),
    resetIdentity: (state) => ({
      ...state,
      identity: { ...initialIdentityState },
    }),
    setLoading: (state, action) => ({
      ...state,
      loading: action.payload,
    }),
    setError: (state, action) => ({
      ...state,
      error: action.payload,
    }),
    resetAccountUpgrade: () => ({
      ...initialState,
    }),
  },
})

export const {
  setAccountUpgrade,
  setPersonalInfo,
  setBusinessInfo,
  setBankInfo,
  setIdentity,
  setIdentityCapture,
  setIdentityUploaded,
  resetIdentity,
  setLoading,
  setError,
  resetAccountUpgrade,
} = accountUpgradeSlice.actions
export default accountUpgradeSlice.reducer
