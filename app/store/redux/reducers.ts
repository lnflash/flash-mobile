import { combineReducers } from "@reduxjs/toolkit"

// slices
import userSlice from "./slices/userSlice"
import accountUpgradeSlice from "./slices/accountUpgradeSlice"
import flashcardV2Slice from "./slices/flashcardV2Slice"

export default combineReducers({
  user: userSlice,
  accountUpgrade: accountUpgradeSlice,
  flashcardV2: flashcardV2Slice,
})
