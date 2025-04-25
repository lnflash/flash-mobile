import { combineReducers } from "@reduxjs/toolkit"

// slices
import userSlice from "./slices/userSlice"
import businessAccountSlice from "./slices/businessAccountSlice"

export default combineReducers({
  user: userSlice,
  businessAccount: businessAccountSlice,
})
