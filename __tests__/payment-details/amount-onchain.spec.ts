import { WalletCurrency } from "@app/graphql/generated"
import { ConvertMoneyAmount } from "@app/screens/send-bitcoin-screen/payment-details"
import * as PaymentDetails from "@app/screens/send-bitcoin-screen/payment-details/onchain"
import { toBtcMoneyAmount } from "@app/types/amounts"
import {
  btcSendingWalletDescriptor,
  convertMoneyAmountMock,
  createGetFeeMocks,
  createSendPaymentMocks,
  expectDestinationSpecifiedMemoCannotSetMemo,
  getTestSetMemo,
  getTestSetSendingWalletDescriptor,
  testAmount,
  usdSendingWalletDescriptor,
} from "./helpers"

const defaultParams: PaymentDetails.CreateAmountOnchainPaymentDetailsParams<WalletCurrency> =
  {
    address: "testaddress",
    destinationSpecifiedAmount: testAmount,
    convertMoneyAmount: convertMoneyAmountMock,
    sendingWalletDescriptor: btcSendingWalletDescriptor,
  }

const spy = jest.spyOn(PaymentDetails, "createAmountOnchainPaymentDetails")

describe("no amount onchain payment details", () => {
  const { createAmountOnchainPaymentDetails } = PaymentDetails

  beforeEach(() => {
    spy.mockClear()
  })

  it("properly sets fields with all arguments provided", () => {
    const paymentDetails = createAmountOnchainPaymentDetails(defaultParams)
    expect(paymentDetails).toEqual(
      expect.objectContaining({
        destination: defaultParams.address,
        settlementAmount: defaultParams.convertMoneyAmount(
          defaultParams.destinationSpecifiedAmount,
          defaultParams.sendingWalletDescriptor.currency,
        ),
        unitOfAccountAmount: defaultParams.destinationSpecifiedAmount,
        sendingWalletDescriptor: defaultParams.sendingWalletDescriptor,
        settlementAmountIsEstimated: false,
        canGetFee: true,
        canSendPayment: true,
        canSetAmount: false,
        canSetMemo: true,
        convertMoneyAmount: defaultParams.convertMoneyAmount,
      }),
    )
  })

  describe("sending from a btc wallet", () => {
    const btcSendingWalletParams = {
      ...defaultParams,
      sendingWalletDescriptor: btcSendingWalletDescriptor,
    }
    const paymentDetails = createAmountOnchainPaymentDetails(btcSendingWalletParams)
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
  ;[WalletCurrency.Usd, WalletCurrency.Usdt].forEach((currency) => {
    describe(`sending from a ${currency} cash wallet`, () => {
      // Ten sats per cent, so a call that passed the converted cents instead of
      // the request's sats would show up as a different number.
      const cashParams = {
        ...defaultParams,
        destinationSpecifiedAmount: toBtcMoneyAmount(6_000),
        convertMoneyAmount: ((amount, toCurrency) => ({
          amount: amount.currency === toCurrency ? amount.amount : amount.amount / 10,
          currency: toCurrency,
          currencyCode: toCurrency,
        })) as ConvertMoneyAmount,
        sendingWalletDescriptor: { ...usdSendingWalletDescriptor, currency },
      }
      const paymentDetails = createAmountOnchainPaymentDetails(cashParams)

      it("keeps the request's sats and settles an estimate in cents", () => {
        expect(paymentDetails.destinationSpecifiedAmount).toEqual(toBtcMoneyAmount(6_000))
        // 600 cents at the fixture price, plus the server's 0.5% margin.
        expect(paymentDetails.settlementAmount).toEqual({
          amount: 603,
          currency,
          currencyCode: currency,
        })
        expect(paymentDetails.settlementAmountIsEstimated).toBe(true)
        expect(paymentDetails.canGetFee).toBe(true)
        expect(paymentDetails.canSendPayment).toBe(true)
      })

      it("gets the fee in sats and reads it as cents in the wallet currency", async () => {
        const feeParamsMocks = createGetFeeMocks()
        ;(feeParamsMocks.onChainUsdTxFeeAsBtcDenominated as jest.Mock).mockResolvedValue({
          data: { onChainUsdTxFeeAsBtcDenominated: { amount: 37 } },
        })
        if (!paymentDetails.canGetFee) {
          throw new Error("Cannot get fee")
        }

        const fee = await paymentDetails.getFee(feeParamsMocks)

        expect(feeParamsMocks.onChainUsdTxFeeAsBtcDenominated).toHaveBeenCalledWith({
          variables: {
            address: defaultParams.address,
            amount: 6_000,
            walletId: usdSendingWalletDescriptor.id,
          },
        })
        expect(feeParamsMocks.onChainUsdTxFee).not.toHaveBeenCalled()
        expect(feeParamsMocks.onChainTxFee).not.toHaveBeenCalled()
        expect(fee.amount).toEqual({ amount: 37, currency, currencyCode: currency })
      })

      it("sends the request's sats from the cash wallet", async () => {
        const sendPaymentMocks = createSendPaymentMocks()
        const paymentDetailsWithNote = createAmountOnchainPaymentDetails({
          ...cashParams,
          senderSpecifiedMemo: "note",
        })
        if (!paymentDetailsWithNote.canSendPayment) {
          throw new Error("Cannot send payment")
        }

        try {
          await paymentDetailsWithNote.sendPaymentMutation(sendPaymentMocks)
        } catch {
          // do nothing as function is expected to throw since we are not mocking the send payment response
        }

        expect(
          sendPaymentMocks.onChainUsdPaymentSendAsBtcDenominated,
        ).toHaveBeenCalledWith({
          variables: {
            input: {
              address: defaultParams.address,
              amount: 6_000,
              walletId: usdSendingWalletDescriptor.id,
              memo: "note",
            },
          },
        })
        expect(sendPaymentMocks.onChainUsdPaymentSend).not.toHaveBeenCalled()
        expect(sendPaymentMocks.onChainPaymentSend).not.toHaveBeenCalled()
      })
    })
  })

  it("cannot set memo if memo is provided", () => {
    const paramsWithMemo = {
      ...defaultParams,
      destinationSpecifiedMemo: "sender memo",
    }
    const paymentDetails = createAmountOnchainPaymentDetails(paramsWithMemo)
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
      creatorFunction: createAmountOnchainPaymentDetails,
    })
  })

  it("can set sending wallet descriptor", () => {
    const testSetSendingWalletDescriptor = getTestSetSendingWalletDescriptor()
    testSetSendingWalletDescriptor({
      defaultParams,
      spy,
      creatorFunction: createAmountOnchainPaymentDetails,
    })
  })
})
