// Manual jest mock for the react-native-fs native module.
// react-native-fs instantiates a NativeEventEmitter at import time, which throws
// under jest ("requires a non-null argument") because the native module is not
// registered in the test environment. The breez/spark code path only uses a few
// filesystem helpers, so a lightweight stub is sufficient for unit tests.
export const DocumentDirectoryPath = "/tmp/flash-mobile-test/documents"
export const CachesDirectoryPath = "/tmp/flash-mobile-test/caches"
export const TemporaryDirectoryPath = "/tmp/flash-mobile-test/tmp"

export const exists = jest.fn(async () => false)
export const mkdir = jest.fn(async () => undefined)
export const unlink = jest.fn(async () => undefined)
export const readFile = jest.fn(async () => "")
export const writeFile = jest.fn(async () => undefined)
export const readDir = jest.fn(async () => [])
export const stat = jest.fn(async () => ({ isFile: () => true, isDirectory: () => false }))
export const moveFile = jest.fn(async () => undefined)
export const copyFile = jest.fn(async () => undefined)

export default {
  DocumentDirectoryPath,
  CachesDirectoryPath,
  TemporaryDirectoryPath,
  exists,
  mkdir,
  unlink,
  readFile,
  writeFile,
  readDir,
  stat,
  moveFile,
  copyFile,
}
