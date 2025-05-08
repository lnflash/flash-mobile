import { createSlice } from "@reduxjs/toolkit"
import { CountryCode } from "libphonenumber-js"
import { Asset } from "react-native-image-picker"

interface AccountUpgradeSlice {
  id?: string
  accountType?: "personal" | "business" | "merchant"
  upgradeCompleted?: boolean
  personalInfo: {
    fullName?: string
    countryCode?: CountryCode
    phoneNumber?: string
    email?: string
  }
  businessInfo: {
    businessName?: string
    businessAddress?: string
    lat?: number
    lng?: number
  }
  bankInfo: {
    bankName?: string
    bankBranch?: string
    bankAccountType?: string
    currency?: string
    accountNumber?: string
    idDocument?: Asset
  }
  loading: boolean
  error?: string
}

const initialState: AccountUpgradeSlice = {
  id: undefined,
  accountType: undefined,
  upgradeCompleted: undefined,
  personalInfo: {
    fullName: undefined,
    countryCode: "JM",
    phoneNumber: undefined,
    email: undefined,
  },
  businessInfo: {
    businessName: undefined,
    businessAddress: undefined,
    lat: undefined,
    lng: undefined,
  },
  bankInfo: {
    bankName: undefined,
    bankBranch: undefined,
    bankAccountType: undefined,
    currency: undefined,
    accountNumber: undefined,
    idDocument: undefined,
  },
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
  setLoading,
  setError,
  resetAccountUpgrade,
} = accountUpgradeSlice.actions
export default accountUpgradeSlice.reducer
