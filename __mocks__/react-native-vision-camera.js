const React = require("react")

const requestPermission = jest.fn(() => Promise.resolve(true))

const Camera = React.forwardRef((props, ref) =>
  React.createElement("Camera", { ...props, ref }),
)

module.exports = {
  __esModule: true,
  Camera,
  CameraRuntimeError: Error,
  useCameraDevice: jest.fn(() => ({ id: "back" })),
  useCameraPermission: jest.fn(() => ({
    hasPermission: true,
    requestPermission,
  })),
  useCodeScanner: jest.fn((config) => config),
}
