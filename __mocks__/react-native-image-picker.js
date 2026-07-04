const emptyResult = { assets: [], didCancel: true }

const launchImageLibrary = jest.fn((_, callback) => {
  if (typeof callback === "function") {
    callback(emptyResult)
  }

  return Promise.resolve(emptyResult)
})

const launchCamera = jest.fn((_, callback) => {
  if (typeof callback === "function") {
    callback(emptyResult)
  }

  return Promise.resolve(emptyResult)
})

module.exports = {
  __esModule: true,
  launchCamera,
  launchImageLibrary,
}
