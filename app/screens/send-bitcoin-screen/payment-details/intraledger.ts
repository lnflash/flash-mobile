import { WalletCurrency } from "@app/graphql/generated"
import { MoneyAmount, WalletOrDisplayCurrency, toWalletAmount } from "@app/types/amounts"
import { PaymentType } from "@galoymoney/client"
import { IDEMPOTENT_SEND_INPUTS, withIdempotencyKey } from "./idempotency-support"
import {
  BaseCreatePaymentDetailsParams,
  ConvertMoneyAmount,
  GetFee,
  PaymentDetail,
  PaymentDetailSendPaymentGetFee,
  PaymentDetailSetMemo,
  SendPaymentMutation,
  SetAmount,
  SetSendingWalletDescriptor,
} from "./index.types"

export type CreateIntraledgerPaymentDetailsParams<T extends WalletCurrency> = {
  handle: string
  recipientWalletId: string
  unitOfAccountAmount: MoneyAmount<WalletOrDisplayCurrency>
} & BaseCreatePaymentDetailsParams<T>

export const createIntraledgerPaymentDetails = <T extends WalletCurrency>(
  params: CreateIntraledgerPaymentDetailsParams<T>,
): PaymentDetail<T> => {
  const {
    handle,
    recipientWalletId,
    unitOfAccountAmount,
    convertMoneyAmount,
    sendingWalletDescriptor,
    senderSpecifiedMemo,
    destinationSpecifiedMemo,
  } = params

  const memo = destinationSpecifiedMemo || senderSpecifiedMemo
  const settlementAmount = convertMoneyAmount(
    unitOfAccountAmount,
    sendingWalletDescriptor.currency,
  )

  const getFee: GetFee<T> = (_) => {
    return Promise.resolve({
      amount: toWalletAmount({
        amount: 0,
        currency: sendingWalletDescriptor.currency,
      }),
    })
  }

  let sendPaymentAndGetFee: PaymentDetailSendPaymentGetFee<T> = {
    canSendPayment: false,
    canGetFee: false,
  }
  // The data half of the freeze for whichever branch can send — see

  if (
    settlementAmount.amount &&
    sendingWalletDescriptor.currency === WalletCurrency.Btc
  ) {
    const wireInput = {
      walletId: sendingWalletDescriptor.id,
      recipientWalletId,
      amount: settlementAmount.amount,
      memo,
    }

    const sendPaymentMutation: SendPaymentMutation = async (paymentMutations) =>
      // Gated like every other send input — see idempotency-support.ts.
      withIdempotencyKey(
        paymentMutations.idempotencyKey,
        {
          apiEndpoint: paymentMutations.apiEndpoint,
          inputType: IDEMPOTENT_SEND_INPUTS.intraLedger,
        },
        async (keyField) => {
          const { data } = await paymentMutations.intraLedgerPaymentSend({
            variables: {
              input: {
                ...wireInput,
                // Same key for every repeat of this attempt, so a send whose
                // response was lost settles once. See SendPaymentMutationParams.
                ...keyField,
              },
            },
          })

          return {
            status: data?.intraLedgerPaymentSend.status,
            errors: data?.intraLedgerPaymentSend.errors,
          }
        },
      )

    sendPaymentAndGetFee = {
      canSendPayment: true,
      sendPaymentMutation,
      canGetFee: true,
      getFee,
    }
  } else if (
    settlementAmount.amount &&
    (sendingWalletDescriptor.currency === WalletCurrency.Usd ||
      sendingWalletDescriptor.currency === WalletCurrency.Usdt)
  ) {
    const wireInput = {
      walletId: sendingWalletDescriptor.id,
      recipientWalletId,
      amount: settlementAmount.amount,
      memo,
    }

    const sendPaymentMutation: SendPaymentMutation = async (paymentMutations) =>
      // USD/USDT Flash-to-Flash — the same double-debit class ENG-533 exists to
      // close, and gated like every other send input.
      withIdempotencyKey(
        paymentMutations.idempotencyKey,
        {
          apiEndpoint: paymentMutations.apiEndpoint,
          inputType: IDEMPOTENT_SEND_INPUTS.intraLedgerUsd,
        },
        async (keyField) => {
          const { data } = await paymentMutations.intraLedgerUsdPaymentSend({
            variables: {
              input: {
                // `intraledger|${recipientWalletId}|${amount}`, and a USD/USDT
                // amount is price-derived — so the rebuilt input drifts by a
                // cent and the backend refuses to replay.
                ...wireInput,
                // Same key for every repeat of this attempt, so a send whose
                // response was lost settles once. See SendPaymentMutationParams.
                ...keyField,
              },
            },
          })

          return {
            status: data?.intraLedgerUsdPaymentSend.status,
            errors: data?.intraLedgerUsdPaymentSend.errors,
          }
        },
      )

    sendPaymentAndGetFee = {
      canSendPayment: true,
      sendPaymentMutation,
      canGetFee: true,
      getFee,
    }
  }

  const setConvertMoneyAmount = (newConvertMoneyAmount: ConvertMoneyAmount) => {
    return createIntraledgerPaymentDetails({
      ...params,
      convertMoneyAmount: newConvertMoneyAmount,
    })
  }

  const setMemo: PaymentDetailSetMemo<T> = destinationSpecifiedMemo
    ? { canSetMemo: false }
    : {
        setMemo: (newMemo) =>
          createIntraledgerPaymentDetails({
            ...params,
            senderSpecifiedMemo: newMemo,
          }),
        canSetMemo: true,
      }

  const setAmount: SetAmount<T> = (newUnitOfAccountAmount) => {
    return createIntraledgerPaymentDetails({
      ...params,
      unitOfAccountAmount: newUnitOfAccountAmount,
    })
  }

  const setSendingWalletDescriptor: SetSendingWalletDescriptor<T> = (
    newSendingWalletDescriptor,
  ) => {
    return createIntraledgerPaymentDetails({
      ...params,
      sendingWalletDescriptor: newSendingWalletDescriptor,
    })
  }

  return {
    destination: handle,
    settlementAmount,
    settlementAmountIsEstimated: false,
    unitOfAccountAmount,
    sendingWalletDescriptor,
    memo,
    paymentType: PaymentType.Intraledger,
    setSendingWalletDescriptor,
    convertMoneyAmount,
    setConvertMoneyAmount,
    setAmount,
    canSetAmount: true,
    ...setMemo,
    ...sendPaymentAndGetFee,
  } as const
}
