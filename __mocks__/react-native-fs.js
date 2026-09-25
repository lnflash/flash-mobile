const RNFS = {
  CachesDirectoryPath: "/tmp",
  DocumentDirectoryPath: "/tmp",
  DownloadDirectoryPath: "/tmp",
  TemporaryDirectoryPath: "/tmp",
  appendFile: jest.fn(() => Promise.resolve()),
  copyFile: jest.fn(() => Promise.resolve()),
  downloadFile: jest.fn(() => ({
    jobId: 1,
    promise: Promise.resolve({ statusCode: 200 }),
  })),
  exists: jest.fn(() => Promise.resolve(false)),
  hash: jest.fn(() => Promise.resolve("")),
  mkdir: jest.fn(() => Promise.resolve()),
  moveFile: jest.fn(() => Promise.resolve()),
  readFile: jest.fn(() => Promise.resolve("")),
  unlink: jest.fn(() => Promise.resolve()),
  writeFile: jest.fn(() => Promise.resolve()),
}

module.exports = RNFS
module.exports.default = RNFS
