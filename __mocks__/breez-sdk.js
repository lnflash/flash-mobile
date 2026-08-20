module.exports = {
  receiveOnchainBreez: jest.fn(() => Promise.resolve({ paymentRequest: "" })),
  receivePaymentBreez: jest.fn(() => Promise.resolve({ paymentRequest: "" })),
  fetchBreezFee: jest.fn(() => Promise.resolve({ fee: 0, err: null })),
  fetchLnurlPayRequest: jest.fn(() => Promise.resolve(null)),
  payLightningBreez: jest.fn(() => Promise.resolve({ success: true, error: undefined })),
  payLnurlBreez: jest.fn(() => Promise.resolve({ success: true, error: undefined })),
  payOnchainBreez: jest.fn(() => Promise.resolve({ success: true, error: undefined })),
}
