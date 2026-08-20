/* eslint-disable */

const logEvent = jest.fn()

const instance = {
  logEvent,
  setUserId: jest.fn(),
  setUserProperty: jest.fn(),
  setUserProperties: jest.fn(),
  logScreenView: jest.fn(),
}

// Modular API (`import { getAnalytics } from "@react-native-firebase/analytics"`),
// which is what app/utils/analytics.ts uses. Without it every logged event
// throws "getAnalytics is not a function" and swallows the call it wrapped.
export const getAnalytics = () => instance

export default () => instance
