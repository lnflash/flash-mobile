module.exports = {
  receiveOnchainBreez: jest.fn(() => Promise.resolve({ paymentRequest: "" })),
  receivePaymentBreez: jest.fn(() => Promise.resolve({ paymentRequest: "" })),
  fetchBreezFee: jest.fn(() => Promise.resolve({ fee: 0, err: null })),
  fetchLnurlPayRequest: jest.fn(() => Promise.resolve(null)),
}
