const credentialsByServer = new Map()

const getServer = (serverOrOptions) =>
  typeof serverOrOptions === "string" ? serverOrOptions : serverOrOptions?.server

const getInternetCredentials = jest.fn((serverOrOptions) =>
  Promise.resolve(credentialsByServer.get(getServer(serverOrOptions)) || false),
)

const setInternetCredentials = jest.fn((server, username, password) => {
  credentialsByServer.set(server, { password, server, username })
  return Promise.resolve(true)
})

const resetInternetCredentials = jest.fn((serverOrOptions) => {
  credentialsByServer.delete(getServer(serverOrOptions))
  return Promise.resolve(true)
})

module.exports = {
  __esModule: true,
  ACCESSIBLE: {},
  getInternetCredentials,
  resetInternetCredentials,
  setInternetCredentials,
}
