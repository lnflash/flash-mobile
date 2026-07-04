const configValue = {
  asBoolean: () => false,
  asNumber: () => 0,
  asString: () => "",
}

const remoteConfig = {
  setDefaults: jest.fn(() => Promise.resolve(null)),
  setConfigSettings: jest.fn(() => Promise.resolve(null)),
  fetchAndActivate: jest.fn(() => Promise.resolve(true)),
  getValue: jest.fn(() => configValue),
}

export const getRemoteConfig = () => remoteConfig

export default () => remoteConfig
