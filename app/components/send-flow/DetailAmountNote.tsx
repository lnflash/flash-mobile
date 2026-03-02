import React, { useEffect, useState } from "react"
import { makeStyles, Text } from "@rneui/themed"
import { View } from "react-native"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useBreez, useDisplayCurrency, usePriceConversion } from "@app/hooks"

// components
import { GaloyTertiaryButton } from "@app/components/atomic/galoy-tertiary-button"
import { AmountInput } from "@app/components/amount-input/amount-input"
import { NoteInput } from "@app/components/note-input"

// types
import { PaymentDetail } from "@app/screens/send-bitcoin-screen/payment-details"
import { WalletCurrency } from "@app/graphql/generated"
import {
  isNonZeroMoneyAmount,
  MoneyAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"

// utils
import { testProps } from "../../utils/testProps"

type Props = {
  selectedFeeType?: "fast" | "medium" | "slow"
  usdWallet: any
  paymentDetail: PaymentDetail<WalletCurrency>
  setPaymentDetail: (val: PaymentDetail<WalletCurrency>) => void
  setAsyncErrorMessage: (val: string) => void
  invoiceAmount?: MoneyAmount<WalletCurrency>
}

const DetailAmountNote: React.FC<Props> = ({
  selectedFeeType,
  usdWallet,
  paymentDetail,
  setPaymentDetail,
  setAsyncErrorMessage,
  invoiceAmount,
}) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()
  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  const { sendingWalletDescriptor } = paymentDetail

  useEffect(() => {
    if (paymentDetail.isSendingMax && selectedFeeType) {
      sendAll()
    }
  }, [selectedFeeType, paymentDetail.isSendingMax])

  useEffect(() => {
    checkErrorMessage()
  }, [paymentDetail])

  const checkErrorMessage = () => {
    if (!convertMoneyAmount) return null
    if (paymentDetail?.sendingWalletDescriptor.currency === "USD") {
      if (paymentDetail?.paymentType === "lnurl") {
        if (
          paymentDetail.canSetAmount &&
          isNonZeroMoneyAmount(paymentDetail.settlementAmount) &&
          paymentDetail.settlementAmount.amount < paymentDetail?.lnurlParams.min
        ) {
          const minAmount: MoneyAmount<WalletCurrency> = {
            amount: paymentDetail?.lnurlParams.min,
            currency: "BTC",
            currencyCode: "SAT",
          }
          const convertedUSDAmount = convertMoneyAmount(minAmount, "DisplayCurrency")
          setAsyncErrorMessage(
            LL.SendBitcoinScreen.minAmountInvoiceError({
              amount: Number(
                formatDisplayAndWalletAmount({
                  displayAmount: convertedUSDAmount,
                  walletAmount: minAmount,
                }),
              ),
            }),
          )
        } else if (
          paymentDetail.canSetAmount &&
          isNonZeroMoneyAmount(paymentDetail.settlementAmount) &&
          paymentDetail.settlementAmount.amount > paymentDetail?.lnurlParams.max
        ) {
          const maxAmount: MoneyAmount<WalletCurrency> = {
            amount: paymentDetail?.lnurlParams.max,
            currency: "BTC",
            currencyCode: "SAT",
          }
          const convertedUSDAmount = convertMoneyAmount(maxAmount, "DisplayCurrency")
          setAsyncErrorMessage(
            LL.SendBitcoinScreen.maxAmountInvoiceError({
              amount: Number(
                formatDisplayAndWalletAmount({
                  displayAmount: convertedUSDAmount,
                  walletAmount: maxAmount,
                }),
              ),
            }),
          )
        } else {
          setAsyncErrorMessage("")
        }
      } else {
        setAsyncErrorMessage("")
      }
    }
  }

  const sendAll = async () => {
    let moneyAmount: MoneyAmount<WalletCurrency>

    if (paymentDetail.sendingWalletDescriptor.currency === WalletCurrency.Btc) {
      moneyAmount = {
        amount: btcWallet.balance,
        currency: WalletCurrency.Btc,
        currencyCode: "BTC",
      }
    } else {
      moneyAmount = {
        amount: usdWallet?.balance ?? 0,
        currency: WalletCurrency.Usd,
        currencyCode: "USD",
      }
    }

    setPaymentDetail(
      paymentDetail?.setAmount
        ? paymentDetail.setAmount(moneyAmount, true)
        : paymentDetail,
    )
  }

  const setAmount = (moneyAmount: MoneyAmount<WalletOrDisplayCurrency>) => {
    setAsyncErrorMessage("")
    setPaymentDetail(
      paymentDetail?.setAmount ? paymentDetail.setAmount(moneyAmount) : paymentDetail,
    )
  }

  return (
    <>
      <View style={styles.fieldContainer}>
        <View style={styles.amountRightMaxField}>
          <Text {...testProps(LL.SendBitcoinScreen.amount())} style={styles.amountText}>
            {LL.SendBitcoinScreen.amount()}
          </Text>
          {paymentDetail.canSendMax && !paymentDetail.isSendingMax && (
            <GaloyTertiaryButton
              clear
              title={LL.SendBitcoinScreen.maxAmount()}
              onPress={sendAll}
            />
          )}
        </View>
        <View style={styles.currencyInputContainer}>
          <AmountInput
            unitOfAccountAmount={
              sendingWalletDescriptor.currency === "USD" && invoiceAmount
                ? invoiceAmount
                : paymentDetail.unitOfAccountAmount
            }
            setAmount={setAmount}
            convertMoneyAmount={paymentDetail.convertMoneyAmount}
            walletCurrency={sendingWalletDescriptor.currency}
            canSetAmount={paymentDetail.canSetAmount}
            isSendingMax={paymentDetail.isSendingMax}
            title="Send"
          />
        </View>
      </View>
      {paymentDetail.canSetMemo && (
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldTitleText}>{LL.SendBitcoinScreen.note()}</Text>
          <NoteInput
            onChangeText={(text) =>
              paymentDetail.setMemo && setPaymentDetail(paymentDetail.setMemo(text))
            }
            value={paymentDetail.memo || ""}
            editable={paymentDetail.canSetMemo}
          />
        </View>
      )}
    </>
  )
}

export default DetailAmountNote

const useStyles = makeStyles(({ colors }) => ({
  sendBitcoinAmountContainer: {
    flex: 1,
  },

  fieldTitleText: {
    fontWeight: "bold",
    marginBottom: 4,
  },
  fieldContainer: {
    marginBottom: 12,
  },
  currencyInputContainer: {
    flexDirection: "column",
  },

  buttonContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modal: {
    marginBottom: "90%",
  },
  pickWalletIcon: {
    marginRight: 12,
  },
  screenStyle: {
    padding: 20,
    flexGrow: 1,
  },
  amountText: {
    fontWeight: "bold",
  },
  amountRightMaxField: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    height: 18,
  },
}))
