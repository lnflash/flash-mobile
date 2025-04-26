import { createSlice } from "@reduxjs/toolkit"

interface AccountUpgradeSlice {
  accountType: "personal" | "pro" | "merchant"
  personalInfo: {
    fullName: string
    countryCode: string
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
    document: string
  }
  loading: boolean
  error: string
}

const initialState: AccountUpgradeSlice = {
  accountType: null,
  personalInfo: {
    fullName: null,
    countryCode: "JM",
    phoneNumber: null,
    email: null,
  },
  businessInfo: {
    businessName: null,
    businessAddress: null,
  },
  bankInfo: {
    bankName: null,
    bankBranch: null,
    accountType: null,
    currency: null,
    accountNumber: null,
    document: null,
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
    resetUserSlice: () => ({
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
  resetUserSlice,
} = accountUpgradeSlice.actions
export default accountUpgradeSlice.reducer
