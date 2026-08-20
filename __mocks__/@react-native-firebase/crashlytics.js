/* eslint-disable */

const instance = {
  log: (message) => {},
  recordError: (err) => {},
}

// Modular API (`import { getCrashlytics } from "@react-native-firebase/crashlytics"`),
// which is what the send flow uses. Without it, any code path that reports an
// error throws "getCrashlytics is not a function" and masks the real failure.
export const getCrashlytics = () => instance

export default () => instance
