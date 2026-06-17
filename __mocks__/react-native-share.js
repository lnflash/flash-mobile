// Manual jest mock for react-native-share (native module, getEnforcing at import).
const Share = {
  open: jest.fn(async () => ({ success: true })),
  shareSingle: jest.fn(async () => ({ success: true })),
  Social: {},
}
export default Share
