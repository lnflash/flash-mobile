import { WalletCurrency } from "@app/graphql/generated"
import {
  BtcMoneyAmount,
  MoneyAmount,
  WalletOrDisplayCurrency,
  toWalletAmount,
} from "@app/types/amounts"
import { PaymentType } from "@galoymoney/client"
import {
  ConvertMoneyAmount,
  PaymentDetail,
  SetAmount,
  SetSendingWalletDescriptor,
  BaseCreatePaymentDetailsParams,
  PaymentDetailSendPaymentGetFee,
  PaymentDetailSetMemo,
  SendPaymentMutation,
  GetFee,
} from "./index.types"

export type CreateNoAmountOnchainPaymentDetailsParams<T extends WalletCurrency> = {
  address: string
  isSendingMax?: boolean
  unitOfAccountAmount: MoneyAmount<WalletOrDisplayCurrency>
} & BaseCreatePaymentDetailsParams<T>

export const createNoAmountOnchainPaymentDetails = <T extends WalletCurrency>(
  params: CreateNoAmountOnchainPaymentDetailsParams<T>,
): PaymentDetail<T> => {
  const {
    convertMoneyAmount,
    sendingWalletDescriptor,
    destinationSpecifiedMemo,
    unitOfAccountAmount,
    senderSpecifiedMemo,
    isSendingMax,
    address,
  } = params

  const settlementAmount = convertMoneyAmount(
    unitOfAccountAmount,
    sendingWalletDescriptor.currency,
  )
  const memo = destinationSpecifiedMemo || senderSpecifiedMemo

  let sendPaymentAndGetFee: PaymentDetailSendPaymentGetFee<T> = {
    canSendPayment: false,
    canGetFee: false,
  }

  if (isSendingMax) {
    const sendPaymentMutation: SendPaymentMutation = async (paymentMutations) => {
      const { data } = await paymentMutations.onChainPaymentSendAll({
        variables: {
          input: {
            walletId: sendingWalletDescriptor.id,
            address,
            memo,
          },
        },
      })

      return {
        status: data?.onChainPaymentSendAll.status,
        errors: data?.onChainPaymentSendAll.errors,
      }
    }

    const getFee: GetFee<T> = async (getFeeFns) => {
      if (sendingWalletDescriptor.currency === WalletCurrency.Btc) {
        const { data } = await getFeeFns.onChainTxFee({
          variables: {
            walletId: sendingWalletDescriptor.id,
            address,
            amount: settlementAmount.amount,
          },
        })

        const rawAmount = data?.onChainTxFee.amount
        const amount =
          typeof rawAmount === "number" // FIXME: this branch is never taken? rawAmount is type number | undefined
            ? toWalletAmount({
                amount: rawAmount,
                currency: sendingWalletDescriptor.currency,
              })
            : rawAmount

        return {
          amount,
        }
      } else if (
        sendingWalletDescriptor.currency === WalletCurrency.Usd ||
        sendingWalletDescriptor.currency === WalletCurrency.Usdt
      ) {
        const { data } = await getFeeFns.onChainUsdTxFee({
          variables: {
            walletId: sendingWalletDescriptor.id,
            address,
            amount: settlementAmount.amount,
          },
        })

        const rawAmount = data?.onChainUsdTxFee.amount
        const amount =
          typeof rawAmount === "number" // FIXME: this branch is never taken? rawAmount is type number | undefined
            ? toWalletAmount({
                amount: rawAmount,
                currency: sendingWalletDescriptor.currency,
              })
            : rawAmount

        return {
          amount,
        }
      }

      return { amount: null }
    }

    sendPaymentAndGetFee = {
      canSendPayment: true,
      canGetFee: true,
      sendPaymentMutation,
      getFee,
    }
  } else if (
    settlementAmount.amount &&
    sendingWalletDescriptor.currency === WalletCurrency.Btc
  ) {
    const sendPaymentMutation: SendPaymentMutation = async (paymentMutations) => {
      const { data } = await paymentMutations.onChainPaymentSend({
        variables: {
          input: {
            walletId: sendingWalletDescriptor.id,
            address,
            amount: settlementAmount.amount,
            memo,
          },
        },
      })

      return {
        status: data?.onChainPaymentSend.status,
        errors: data?.onChainPaymentSend.errors,
      }
    }

    const getFee: GetFee<T> = async (getFeeFns) => {
      const { data } = await getFeeFns.onChainTxFee({
        variables: {
          walletId: sendingWalletDescriptor.id,
          address,
          amount: settlementAmount.amount,
        },
      })

      const rawAmount = data?.onChainTxFee.amount
      const amount =
        typeof rawAmount === "number" // FIXME: this branch is never taken? rawAmount is type number | undefined
          ? toWalletAmount({
              amount: rawAmount,
              currency: sendingWalletDescriptor.currency,
            })
          : rawAmount

      return {
        amount,
      }
    }

    sendPaymentAndGetFee = {
      canSendPayment: true,
      canGetFee: true,
      sendPaymentMutation,
      getFee,
    }
  } else if (
    settlementAmount.amount &&
    (sendingWalletDescriptor.currency === WalletCurrency.Usd ||
      sendingWalletDescriptor.currency === WalletCurrency.Usdt)
  ) {
    let sendPaymentMutation: SendPaymentMutation
    let getFee: GetFee<T>

    if (
      settlementAmount.currency === WalletCurrency.Usd ||
      settlementAmount.currency === WalletCurrency.Usdt
    ) {
      sendPaymentMutation = async (paymentMutations) => {
        const { data } = await paymentMutations.onChainUsdPaymentSend({
          variables: {
            input: {
              walletId: sendingWalletDescriptor.id,
              address,
              amount: settlementAmount.amount,
              memo,
            },
          },
        })

        return {
          status: data?.onChainUsdPaymentSend.status,
          errors: data?.onChainUsdPaymentSend.errors,
        }
      }

      getFee = async (getFeeFns) => {
        const { data } = await getFeeFns.onChainUsdTxFee({
          variables: {
            walletId: sendingWalletDescriptor.id,
            address,
            amount: settlementAmount.amount,
          },
        })

        const rawAmount = data?.onChainUsdTxFee.amount
        const amount =
          typeof rawAmount === "number" // FIXME: this branch is never taken? rawAmount is type number | undefined
            ? toWalletAmount({
                amount: rawAmount,
                currency: sendingWalletDescriptor.currency,
              })
            : rawAmount

        return {
          amount,
        }
      }
    } else {
      sendPaymentMutation = async (paymentMutations) => {
        const { data } = await paymentMutations.onChainUsdPaymentSendAsBtcDenominated({
          variables: {
            input: {
              walletId: sendingWalletDescriptor.id,
              address,
              amount: settlementAmount.amount,
              memo,
            },
          },
        })

        return {
          status: data?.onChainUsdPaymentSendAsBtcDenominated.status,
          errors: data?.onChainUsdPaymentSendAsBtcDenominated.errors,
        }
      }

      getFee = async (getFeeFns) => {
        const { data } = await getFeeFns.onChainUsdTxFeeAsBtcDenominated({
          variables: {
            walletId: sendingWalletDescriptor.id,
            address,
            amount: settlementAmount.amount,
          },
        })

        const rawAmount = data?.onChainUsdTxFeeAsBtcDenominated.amount
        const amount =
          typeof rawAmount === "number" // FIXME: this branch is never taken? rawAmount is type number | undefined
            ? toWalletAmount({
                amount: rawAmount,
                currency: sendingWalletDescriptor.currency,
              })
            : rawAmount

        return {
          amount,
        }
      }
    }

    sendPaymentAndGetFee = {
      canSendPayment: true,
      canGetFee: true,
      sendPaymentMutation,
      getFee,
    }
  }

  const setAmount: SetAmount<T> | undefined = (
    newUnitOfAccountAmount,
    sendMax = false,
  ) => {
    return createNoAmountOnchainPaymentDetails({
      ...params,
      isSendingMax: sendMax,
      unitOfAccountAmount: newUnitOfAccountAmount,
    })
  }

  const setMemo: PaymentDetailSetMemo<T> = destinationSpecifiedMemo
    ? { canSetMemo: false }
    : {
        setMemo: (newMemo) =>
          createNoAmountOnchainPaymentDetails({
            ...params,
            senderSpecifiedMemo: newMemo,
          }),
        canSetMemo: true,
      }

  const setConvertMoneyAmount = (newConvertMoneyAmount: ConvertMoneyAmount) => {
    return createNoAmountOnchainPaymentDetails({
      ...params,
      convertMoneyAmount: newConvertMoneyAmount,
    })
  }

  const setSendingWalletDescriptor: SetSendingWalletDescriptor<T> = (
    newSendingWalletDescriptor,
  ) => {
    return createNoAmountOnchainPaymentDetails({
      ...params,
      sendingWalletDescriptor: newSendingWalletDescriptor,
    })
  }

  return {
    destination: address,
    settlementAmount,
    settlementAmountIsEstimated: sendingWalletDescriptor.currency !== WalletCurrency.Btc,
    unitOfAccountAmount,
    sendingWalletDescriptor,
    memo,
    paymentType: PaymentType.Onchain,
    setSendingWalletDescriptor,
    convertMoneyAmount,
    setConvertMoneyAmount,
    ...setMemo,
    setAmount,
    canSetAmount: true,
    ...sendPaymentAndGetFee,
    canSendMax: true,
    isSendingMax,
  } as const
}

/**
 * The margin the server adds when the Cash Account pays a request that fixes
 * its sats, in basis points: the default of the server's
 * onChainWallet.btcDenominatedSendMarginBps.
 */
export const BTC_DENOMINATED_SEND_MARGIN_BPS = 50

/**
 * The cents the server debits from the Cash Account for a request that fixes
 * its sats, before the network fee: the sats at the mid rate (`midRateCents`)
 * plus the margin, rounded UP to a whole cent, as the server's
 * usdCentsToDeliverSats prices them. The margin is not a fee: the recipient
 * gets slightly more than the request.
 */
export const cashCentsToDeliverSats = (midRateCents: number): number =>
  Math.ceil(midRateCents * (1 + BTC_DENOMINATED_SEND_MARGIN_BPS / 10_000))

export type CreateAmountOnchainPaymentDetailsParams<T extends WalletCurrency> = {
  address: string
  destinationSpecifiedAmount: BtcMoneyAmount
} & BaseCreatePaymentDetailsParams<T>

export const createAmountOnchainPaymentDetails = <T extends WalletCurrency>(
  params: CreateAmountOnchainPaymentDetailsParams<T>,
): PaymentDetail<T> => {
  const {
    destinationSpecifiedAmount,
    convertMoneyAmount,
    sendingWalletDescriptor,
    destinationSpecifiedMemo,
    senderSpecifiedMemo,
    address,
  } = params

  const midRateAmount = convertMoneyAmount(
    destinationSpecifiedAmount,
    sendingWalletDescriptor.currency,
  )
  // From the Cash Account the settlement is what the server debits: the sats
  // at the mid rate plus its margin, rounded up to a whole cent. What is sent
  // is still the request's sats (below).
  const settlementAmount =
    sendingWalletDescriptor.currency === WalletCurrency.Usd ||
    sendingWalletDescriptor.currency === WalletCurrency.Usdt
      ? { ...midRateAmount, amount: cashCentsToDeliverSats(midRateAmount.amount) }
      : midRateAmount
  const unitOfAccountAmount = destinationSpecifiedAmount

  const memo = destinationSpecifiedMemo || senderSpecifiedMemo

  let sendPaymentAndGetFee: PaymentDetailSendPaymentGetFee<T> = {
    canSendPayment: false,
    canGetFee: false,
  }

  let sendPaymentMutation: SendPaymentMutation
  let getFee: GetFee<T>

  if (sendingWalletDescriptor.currency === WalletCurrency.Btc) {
    sendPaymentMutation = async (paymentMutations) => {
      const { data } = await paymentMutations.onChainPaymentSend({
        variables: {
          input: {
            walletId: sendingWalletDescriptor.id,
            address,
            amount: settlementAmount.amount,
            memo,
          },
        },
      })

      return {
        status: data?.onChainPaymentSend.status,
        errors: data?.onChainPaymentSend.errors,
      }
    }

    getFee = async (getFeeFns) => {
      const { data } = await getFeeFns.onChainTxFee({
        variables: {
          walletId: sendingWalletDescriptor.id,
          address,
          amount: settlementAmount.amount,
        },
      })

      const rawAmount = data?.onChainTxFee.amount
      const amount =
        typeof rawAmount === "number"
          ? toWalletAmount({
              amount: rawAmount,
              currency: sendingWalletDescriptor.currency,
            })
          : rawAmount

      return {
        amount,
      }
    }

    sendPaymentAndGetFee = {
      canSendPayment: true,
      canGetFee: true,
      sendPaymentMutation,
      getFee,
    }
  } else if (
    sendingWalletDescriptor.currency === WalletCurrency.Usd ||
    sendingWalletDescriptor.currency === WalletCurrency.Usdt
  ) {
    // The request fixes the sats, so the Cash Account sends them as sats: the
    // server prices them in cents and debits the Cash Account. The fee comes
    // back in cents.
    sendPaymentMutation = async (paymentMutations) => {
      const { data } = await paymentMutations.onChainUsdPaymentSendAsBtcDenominated({
        variables: {
          input: {
            walletId: sendingWalletDescriptor.id,
            address,
            amount: destinationSpecifiedAmount.amount,
            memo,
          },
        },
      })

      return {
        status: data?.onChainUsdPaymentSendAsBtcDenominated.status,
        errors: data?.onChainUsdPaymentSendAsBtcDenominated.errors,
      }
    }

    getFee = async (getFeeFns) => {
      const { data } = await getFeeFns.onChainUsdTxFeeAsBtcDenominated({
        variables: {
          walletId: sendingWalletDescriptor.id,
          address,
          amount: destinationSpecifiedAmount.amount,
        },
      })

      const rawAmount = data?.onChainUsdTxFeeAsBtcDenominated.amount
      const amount =
        typeof rawAmount === "number"
          ? toWalletAmount({
              amount: rawAmount,
              currency: sendingWalletDescriptor.currency,
            })
          : rawAmount

      return {
        amount,
      }
    }

    sendPaymentAndGetFee = {
      canSendPayment: true,
      canGetFee: true,
      sendPaymentMutation,
      getFee,
    }
  }

  const setMemo: PaymentDetailSetMemo<T> = destinationSpecifiedMemo
    ? {
        canSetMemo: false,
      }
    : {
        setMemo: (newMemo) =>
          createAmountOnchainPaymentDetails({
            ...params,
            senderSpecifiedMemo: newMemo,
          }),
        canSetMemo: true,
      }

  const setConvertMoneyAmount = (newConvertMoneyAmount: ConvertMoneyAmount) => {
    return createAmountOnchainPaymentDetails({
      ...params,
      convertMoneyAmount: newConvertMoneyAmount,
    })
  }

  const setSendingWalletDescriptor: SetSendingWalletDescriptor<T> = (
    newSendingWalletDescriptor,
  ) => {
    return createAmountOnchainPaymentDetails({
      ...params,
      sendingWalletDescriptor: newSendingWalletDescriptor,
    })
  }

  return {
    destination: address,
    destinationSpecifiedAmount,
    settlementAmount,
    settlementAmountIsEstimated: sendingWalletDescriptor.currency !== WalletCurrency.Btc,
    unitOfAccountAmount,
    sendingWalletDescriptor,
    setSendingWalletDescriptor,
    canSetAmount: false,
    convertMoneyAmount,
    setConvertMoneyAmount,
    ...setMemo,
    memo,
    paymentType: PaymentType.Onchain,
    ...sendPaymentAndGetFee,
  } as const
}
