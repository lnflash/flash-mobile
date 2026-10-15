module.exports = {
  receiveOnchainBreez: jest.fn(() => Promise.resolve({ paymentRequest: "" })),
  receivePaymentBreez: jest.fn(() => Promise.resolve({ paymentRequest: "" })),
  fetchBreezFee: jest.fn(() => Promise.resolve({ fee: 0, err: null })),
  fetchLnurlPayRequest: jest.fn(() => Promise.resolve(null)),
  // payLightningBreez resolves with { success, error, payment }, where payment
  // is the SDK's SendPaymentResponse, and the send path reads the status of
  // the payment inside it (ENG-712). Status 0 is PaymentStatus.Completed, as
  // for payLnurlBreez below.
  payLightningBreez: jest.fn(() =>
    Promise.resolve({ success: true, payment: { payment: { status: 0 } } }),
  ),
  // payLnurlBreez resolves with the SDK's LnurlPayResponse, not the
  // { success, error } answer of the two sends around it, and the send path
  // reads the payment's status (ENG-694). Status 0 is PaymentStatus.Completed
  // in the generated enum, which __mocks__/@breeztech/ mirrors.
  payLnurlBreez: jest.fn(() =>
    Promise.resolve({ payment: { status: 0 }, successAction: undefined }),
  ),
  payOnchainBreez: jest.fn(() => Promise.resolve({ success: true, error: undefined })),
}
