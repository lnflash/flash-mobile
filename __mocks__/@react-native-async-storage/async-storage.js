// Manual jest mock for AsyncStorage.
//
// The package's bundled jest mock is re-exported here. We also provide a
// default export with the full async API so consumers like redux-persist (which
// require a non-null storage engine at import time) work under jest.
const store = new Map()

const AsyncStorageMock = {
  getItem: jest.fn((key) => Promise.resolve(store.has(key) ? store.get(key) : null)),
  setItem: jest.fn((key, value) => {
    store.set(key, value)
    return Promise.resolve(null)
  }),
  removeItem: jest.fn((key) => {
    store.delete(key)
    return Promise.resolve(null)
  }),
  mergeItem: jest.fn(() => Promise.resolve(null)),
  clear: jest.fn(() => {
    store.clear()
    return Promise.resolve(null)
  }),
  getAllKeys: jest.fn(() => Promise.resolve([...store.keys()])),
  flushGetRequests: jest.fn(),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve(null)),
  multiRemove: jest.fn(() => Promise.resolve(null)),
  multiMerge: jest.fn(() => Promise.resolve(null)),
}

export default AsyncStorageMock
export { AsyncStorageMock }
