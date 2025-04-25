import { createSlice } from "@reduxjs/toolkit"

interface BusinessAccountSlice {
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

const initialState: BusinessAccountSlice = {
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

export const businessAccountSlice = createSlice({
  name: "businessAccount",
  initialState,
  reducers: {
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
  setPersonalInfo,
  setBusinessInfo,
  setBankInfo,
  setLoading,
  setError,
  resetUserSlice,
} = businessAccountSlice.actions
export default businessAccountSlice.reducer
