import { createSlice } from "@reduxjs/toolkit"
import { CountryCode } from "libphonenumber-js"
import { Asset } from "react-native-image-picker"

interface AccountUpgradeSlice {
  id?: string
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
    idDocument?: Asset
  }
  loading: boolean
  error: string
}

const initialState: AccountUpgradeSlice = {
  id: undefined,
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
    idDocument: undefined,
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
