import { combineReducers } from "@reduxjs/toolkit"

// slices
import userSlice from "./slices/userSlice"
import accountUpgradeSlice from "./slices/accountUpgradeSlice"

export default combineReducers({
  user: userSlice,
  accountUpgrade: accountUpgradeSlice,
})
