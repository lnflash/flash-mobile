import { createSlice } from "@reduxjs/toolkit"

interface SettingsSlice {
  revealBtcWallet: boolean
  loading: boolean
  error: string
}

const initialState: SettingsSlice = {
  revealBtcWallet: false,
  loading: false,
  error: "",
}

export const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    updateSettings: (state, action) => ({
      ...state,
      ...action.payload,
    }),
    setLoading: (state, action) => ({
      ...state,
      loading: action.payload,
    }),
    setError: (state, action) => ({
      ...state,
      error: action.payload,
    }),
    resetSettingsSlice: () => ({
      ...initialState,
    }),
  },
})

export const { updateSettings, setLoading, setError, resetSettingsSlice } =
  settingsSlice.actions
export default settingsSlice.reducer
