// Manual jest mock for react-native-keychain (native module).
export const getInternetCredentials = jest.fn(async () => false)
export const setInternetCredentials = jest.fn(async () => undefined)
export const resetInternetCredentials = jest.fn(async () => undefined)
export const getGenericPassword = jest.fn(async () => false)
export const setGenericPassword = jest.fn(async () => undefined)
export const resetGenericPassword = jest.fn(async () => undefined)
export default {
  getInternetCredentials,
  setInternetCredentials,
  resetInternetCredentials,
  getGenericPassword,
  setGenericPassword,
  resetGenericPassword,
}
