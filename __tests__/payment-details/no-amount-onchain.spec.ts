import { WalletCurrency } from "@app/graphql/generated"
import * as PaymentDetails from "@app/screens/send-bitcoin-screen/payment-details/onchain"
import {
  testAmount,
  btcSendingWalletDescriptor,
  convertMoneyAmountWithUsdtMock,
  convertMoneyAmountMock,
  createGetFeeMocks,
  createSendPaymentMocks,
  expectCannotGetFee,
  expectCannotSendPayment,
  expectDestinationSpecifiedMemoCannotSetMemo,
  getTestSetAmount,
  getTestSetMemo,
  getTestSetSendingWalletDescriptor,
  usdSendingWalletDescriptor,
  usdtSendingWalletDescriptor,
  zeroAmount,
} from "./helpers"
import {
  toUsdMoneyAmount,
  USDT_MICROS_PER_USD_CENT,
} from "@app/types/amounts"

const defaultParams: PaymentDetails.CreateNoAmountOnchainPaymentDetailsParams<WalletCurrency> =
  {
    address: "testaddress",
    convertMoneyAmount: convertMoneyAmountMock,
    sendingWalletDescriptor: btcSendingWalletDescriptor,
    unitOfAccountAmount: testAmount,
    isSendingMax: false,
  }

const spy = jest.spyOn(PaymentDetails, "createNoAmountOnchainPaymentDetails")

describe("no amount lightning payment details", () => {
  const { createNoAmountOnchainPaymentDetails } = PaymentDetails

  beforeEach(() => {
    spy.mockClear()
  })

  it("properly sets fields with all arguments provided", () => {
    const paymentDetails = createNoAmountOnchainPaymentDetails(defaultParams)
    expect(paymentDetails).toEqual(
      expect.objectContaining({
        destination: defaultParams.address,
        settlementAmount: defaultParams.convertMoneyAmount(
          defaultParams.unitOfAccountAmount,
          defaultParams.sendingWalletDescriptor.currency,
        ),
        unitOfAccountAmount: defaultParams.unitOfAccountAmount,
        sendingWalletDescriptor: defaultParams.sendingWalletDescriptor,
        settlementAmountIsEstimated: false,
        canGetFee: true,
        canSendPayment: true,
        canSetAmount: true,
        canSetMemo: true,
        convertMoneyAmount: defaultParams.convertMoneyAmount,
      }),
    )
  })

  describe("sending from a btc wallet", () => {
    const btcSendingWalletParams = {
      ...defaultParams,
      unitOfAccountAmount: testAmount,
      sendingWalletDescriptor: btcSendingWalletDescriptor,
    }
    const paymentDetails = createNoAmountOnchainPaymentDetails(btcSendingWalletParams)
    const settlementAmount = defaultParams.convertMoneyAmount(
      testAmount,
      btcSendingWalletDescriptor.currency,
    )

    it("uses the correct fee mutations and args", async () => {
      const feeParamsMocks = createGetFeeMocks()
      if (!paymentDetails.canGetFee) {
        throw new Error("Cannot get fee")
      }

      try {
        await paymentDetails.getFee(feeParamsMocks)
      } catch {
        // do nothing as function is expected to throw since we are not mocking the fee response
      }

      expect(feeParamsMocks.onChainTxFee).toHaveBeenCalledWith({
        variables: {
          address: defaultParams.address,
          amount: settlementAmount.amount,
          walletId: btcSendingWalletParams.sendingWalletDescriptor.id,
        },
      })
    })

    it("uses the correct send payment mutation and args", async () => {
      const sendPaymentMocks = createSendPaymentMocks()
      if (!paymentDetails.canSendPayment) {
        throw new Error("Cannot send payment")
      }

      try {
        await paymentDetails.sendPaymentMutation(sendPaymentMocks)
      } catch {
        // do nothing as function is expected to throw since we are not mocking the send payment response
      }

      expect(sendPaymentMocks.onChainPaymentSend).toHaveBeenCalledWith({
        variables: {
          input: {
            address: defaultParams.address,
            amount: settlementAmount.amount,
            walletId: btcSendingWalletParams.sendingWalletDescriptor.id,
          },
        },
      })
    })
  })

  describe("sending from a usd wallet", () => {
    const usdSendingWalletParams = {
      ...defaultParams,
      unitOfAccountAmount: testAmount,
      sendingWalletDescriptor: usdSendingWalletDescriptor,
    }
    const paymentDetails = createNoAmountOnchainPaymentDetails(usdSendingWalletParams)
    const settlementAmount = defaultParams.convertMoneyAmount(
      testAmount,
      usdSendingWalletDescriptor.currency,
    )

    it("uses the correct fee mutations and args", async () => {
      const feeParamsMocks = createGetFeeMocks()
      if (!paymentDetails.canGetFee) {
        throw new Error("Cannot get fee")
      }

      try {
        await paymentDetails.getFee(feeParamsMocks)
      } catch {
        // do nothing as function is expected to throw since we are not mocking the fee response
      }

      expect(feeParamsMocks.onChainUsdTxFee).toHaveBeenCalledWith({
        variables: {
          address: defaultParams.address,
          amount: settlementAmount.amount,
          walletId: usdSendingWalletParams.sendingWalletDescriptor.id,
        },
      })
    })

    it("uses the correct send payment mutation and args", async () => {
      const sendPaymentMocks = createSendPaymentMocks()
      if (!paymentDetails.canSendPayment) {
        throw new Error("Cannot send payment")
      }

      try {
        await paymentDetails.sendPaymentMutation(sendPaymentMocks)
      } catch {
        // do nothing as function is expected to throw since we are not mocking the send payment response
      }

      expect(sendPaymentMocks.onChainUsdPaymentSend).toHaveBeenCalledWith({
        variables: {
          input: {
            address: defaultParams.address,
            amount: settlementAmount.amount,
            walletId: usdSendingWalletParams.sendingWalletDescriptor.id,
          },
        },
      })
    })
  })

  describe("sending from a usdt wallet", () => {
    const unitOfAccountAmount = toUsdMoneyAmount(500)
    const usdtSendingWalletParams = {
      ...defaultParams,
      convertMoneyAmount: convertMoneyAmountWithUsdtMock,
      unitOfAccountAmount,
      sendingWalletDescriptor: usdtSendingWalletDescriptor,
    }
    const paymentDetails = createNoAmountOnchainPaymentDetails(usdtSendingWalletParams)
    const settlementAmount = convertMoneyAmountWithUsdtMock(
      unitOfAccountAmount,
      WalletCurrency.Usdt,
    )

    it("uses USD cents for fee requests and converts fee cents back to USDT micros", async () => {
      const feeParamsMocks = createGetFeeMocks()
      ;(feeParamsMocks.onChainUsdTxFee as jest.Mock).mockResolvedValue({
        data: {
          onChainUsdTxFee: {
            amount: 4,
          },
        },
      })

      if (!paymentDetails.canGetFee) {
        throw new Error("Cannot get fee")
      }

      const fee = await paymentDetails.getFee(feeParamsMocks)

      expect(settlementAmount.amount).toBe(500 * USDT_MICROS_PER_USD_CENT)
      expect(feeParamsMocks.onChainUsdTxFee).toHaveBeenCalledWith({
        variables: {
          address: defaultParams.address,
          amount: 500,
          walletId: usdtSendingWalletParams.sendingWalletDescriptor.id,
        },
      })
      expect(fee.amount).toEqual({
        amount: 4 * USDT_MICROS_PER_USD_CENT,
        currency: WalletCurrency.Usdt,
        currencyCode: "USDT",
      })
    })

    it("uses USD cents for the send payment mutation", async () => {
      const sendPaymentMocks = createSendPaymentMocks()
      if (!paymentDetails.canSendPayment) {
        throw new Error("Cannot send payment")
      }

      try {
        await paymentDetails.sendPaymentMutation(sendPaymentMocks)
      } catch {
        // do nothing as function is expected to throw since we are not mocking the send payment response
      }

      expect(sendPaymentMocks.onChainUsdPaymentSend).toHaveBeenCalledWith({
        variables: {
          input: {
            address: defaultParams.address,
            amount: 500,
            walletId: usdtSendingWalletParams.sendingWalletDescriptor.id,
          },
        },
      })
    })
  })

  it("cannot calculate fee or send payment with zero amount", () => {
    const params: PaymentDetails.CreateNoAmountOnchainPaymentDetailsParams<WalletCurrency> =
      {
        ...defaultParams,
        unitOfAccountAmount: zeroAmount,
      }
    const paymentDetails = createNoAmountOnchainPaymentDetails(params)
    expectCannotGetFee(paymentDetails)
    expectCannotSendPayment(paymentDetails)
  })

  it("cannot set memo if memo is provided", () => {
    const paramsWithMemo = {
      ...defaultParams,
      destinationSpecifiedMemo: "sender memo",
    }
    const paymentDetails = createNoAmountOnchainPaymentDetails(paramsWithMemo)
    expectDestinationSpecifiedMemoCannotSetMemo(
      paymentDetails,
      paramsWithMemo.destinationSpecifiedMemo,
    )
  })

  it("can set memo if no memo provided", () => {
    const testSetMemo = getTestSetMemo()
    testSetMemo({
      defaultParams,
      spy,
      creatorFunction: createNoAmountOnchainPaymentDetails,
    })
  })

  it("can set amount", () => {
    const testSetAmount = getTestSetAmount()
    testSetAmount({
      defaultParams,
      spy,
      creatorFunction: createNoAmountOnchainPaymentDetails,
    })
  })

  it("can set sending wallet descriptor", () => {
    const testSetSendingWalletDescriptor = getTestSetSendingWalletDescriptor()
    testSetSendingWalletDescriptor({
      defaultParams,
      spy,
      creatorFunction: createNoAmountOnchainPaymentDetails,
    })
  })
})
