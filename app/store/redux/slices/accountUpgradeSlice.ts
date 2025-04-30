import { createSlice } from "@reduxjs/toolkit"
import { CountryCode } from "libphonenumber-js"

interface AccountUpgradeSlice {
  accountType?: "personal" | "pro" | "merchant"
  personalInfo: {
    fullName: string
    countryCode: CountryCode
    phoneNumber: string
    email: string
  }
  businessInfo: {
    businessName: string
    businessAddress: string
  }
  bankInfo: {
    bankName: string
    bankBranch: string
    accountType: string
    currency: string
    accountNumber: string
    idDocument: string
  }
  loading: boolean
  error: string
}

const initialState: AccountUpgradeSlice = {
  accountType: undefined,
  personalInfo: {
    fullName: "",
    countryCode: "JM",
    phoneNumber: "",
    email: "",
  },
  businessInfo: {
    businessName: "",
    businessAddress: "",
  },
  bankInfo: {
    bankName: "",
    bankBranch: "",
    accountType: "",
    currency: "",
    accountNumber: "",
    idDocument: "",
  },
  loading: false,
  error: "",
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
