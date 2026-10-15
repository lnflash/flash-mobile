// The real class, so `instanceof` in app code holds for errors made here.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BreezSdkNotInitializedError } = require("../app/utils/breez-sdk/sdk-errors")

module.exports = {
  // A test environment has no BTC wallet running, so the two reads answer the
  // way spark.ts answers with no SDK instance (ENG-687): getInfo rejects with
  // the not-initialized error, which breezBtcRail reports as `disabled`.
  getInfo: jest.fn(() => Promise.reject(new BreezSdkNotInitializedError())),
  listPaymentsBreezSDK: jest.fn(() => Promise.reject(new BreezSdkNotInitializedError())),
  receiveOnchainBreez: jest.fn(() => Promise.resolve({ paymentRequest: "" })),
  receivePaymentBreez: jest.fn(() => Promise.resolve({ paymentRequest: "" })),
  fetchBreezFee: jest.fn(() => Promise.resolve({ fee: 0, err: null })),
  fetchLnurlPayRequest: jest.fn(() => Promise.resolve(null)),
  payLightningBreez: jest.fn(() => Promise.resolve({ success: true, error: undefined })),
  // payLnurlBreez resolves with the SDK's LnurlPayResponse, not the
  // { success, error } answer of the two sends around it, and the send path
  // reads the payment's status (ENG-694). Status 0 is PaymentStatus.Completed
  // in the generated enum, which __mocks__/@breeztech/ mirrors.
  payLnurlBreez: jest.fn(() =>
    Promise.resolve({ payment: { status: 0 }, successAction: undefined }),
  ),
  payOnchainBreez: jest.fn(() => Promise.resolve({ success: true, error: undefined })),
}
