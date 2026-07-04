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
  readFile: jest.fn(() => Promise.resolve("")),
  unlink: jest.fn(() => Promise.resolve()),
  writeFile: jest.fn(() => Promise.resolve()),
}

module.exports = RNFS
module.exports.default = RNFS
