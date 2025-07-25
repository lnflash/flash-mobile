import React, { useEffect } from "react"
import { ActivityIndicator, View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { makeStyles, Text } from "@rneui/themed"

// hooks
import useFee, { FeeType } from "@app/screens/send-bitcoin-screen/use-fee"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"

// types
import { WalletCurrency } from "@app/graphql/generated"
import { PaymentDetail } from "@app/screens/send-bitcoin-screen/payment-details"
import { DisplayCurrency } from "@app/types/amounts"

// utils
import { testProps } from "@app/utils/testProps"
import { fetchBreezFee } from "@app/utils/breez-sdk-liquid"

// assets
import Cash from "@app/assets/icons/cash.svg"
import Bitcoin from "@app/assets/icons/bitcoin.svg"

type Props = {
  flashUserAddress?: string
  paymentDetail: PaymentDetail<WalletCurrency>
  btcWalletText: string
  usdWalletText: string
  feeRateSatPerVbyte?: number
  fee: FeeType
  setFee: (fee: FeeType) => void
  setPaymentError: (val: string) => void
}

const ConfirmationWalletFee: React.FC<Props> = ({
  flashUserAddress,
  paymentDetail,
  btcWalletText,
  usdWalletText,
  feeRateSatPerVbyte,
  fee,
  setFee,
  setPaymentError,
}) => {
  const { sendingWalletDescriptor, getFee, settlementAmount, paymentType } = paymentDetail
  const { LL } = useI18nContext()
  const styles = useStyles()
  const getLightningFee = useFee(getFee ? getFee : null)
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  useEffect(() => {
    getSendingFee()
  }, [
    getLightningFee,
    paymentType,
    sendingWalletDescriptor.currency,
    settlementAmount.amount,
    feeRateSatPerVbyte,
  ])

  const getSendingFee = async () => {
    setFee({ status: "loading", amount: undefined })
    if (sendingWalletDescriptor.currency === "USD") {
      setFee(getLightningFee)
    } else {
      const { fee, err } = await fetchBreezFee(
        paymentType,
        !!flashUserAddress ? flashUserAddress : paymentDetail.destination,
        settlementAmount.amount,
        feeRateSatPerVbyte,
        paymentDetail.isSendingMax,
      )
      if (fee !== null) {
        setFee({
          status: "set",
          amount: { amount: fee, currency: "BTC", currencyCode: "BTC" },
        })
      } else if (fee === "null" && err === "null") {
        setFee({
          status: "unset",
          amount: undefined,
        })
      } else {
        setFee({
          status: "error",
          amount: undefined,
        })
        setPaymentError(`Failed to fetch the fee. ${err} (amount + fee)`)
      }
    }
  }

  let feeDisplayText = ""
  if (fee.amount) {
    const feeDisplayAmount = paymentDetail.convertMoneyAmount(fee.amount, DisplayCurrency)
    feeDisplayText = formatDisplayAndWalletAmount({
      displayAmount: feeDisplayAmount,
      walletAmount: fee.amount,
    })
  } else {
    feeDisplayText = "Unable to calculate fee"
  }

  const CurrencyIcon =
    sendingWalletDescriptor.currency === WalletCurrency.Btc ? Bitcoin : Cash
  return (
    <>
      <View style={styles.fieldContainer}>
        <Text style={styles.fieldTitleText}>{LL.common.from()}</Text>
        <View style={styles.fieldBackground}>
          <View style={styles.walletSelectorTypeContainer}>
            <CurrencyIcon />
          </View>
          <View style={styles.walletSelectorInfoContainer}>
            <View style={styles.walletSelectorTypeTextContainer}>
              {sendingWalletDescriptor.currency === WalletCurrency.Btc ? (
                <Text style={styles.walletCurrencyText}>{LL.common.btcAccount()}</Text>
              ) : (
                <Text style={styles.walletCurrencyText}>{LL.common.usdAccount()}</Text>
              )}
            </View>
            <View style={styles.walletSelectorBalanceContainer}>
              {sendingWalletDescriptor.currency === WalletCurrency.Btc ? (
                <Text>{btcWalletText}</Text>
              ) : (
                <Text>{usdWalletText}</Text>
              )}
            </View>
            <View />
          </View>
        </View>
      </View>
      <View style={styles.fieldContainer}>
        <Text style={styles.fieldTitleText}>
          {LL.SendBitcoinConfirmationScreen.feeLabel()}
        </Text>
        <View style={styles.fieldBackground}>
          {fee.status === "loading" && <ActivityIndicator />}
          {fee.status === "set" && (
            <Text {...testProps("Successful Fee")}>{feeDisplayText}</Text>
          )}
          {fee.status === "error" && Boolean(fee.amount) && (
            <Text>{feeDisplayText} *</Text>
          )}
          {fee.status === "error" && !fee.amount && (
            <Text>{LL.SendBitcoinConfirmationScreen.feeError()}</Text>
          )}
          {fee.status === "unset" && !fee.amount && (
            <Text>{LL.SendBitcoinConfirmationScreen.breezFeeText()}</Text>
          )}
        </View>
        {fee.status === "error" && Boolean(fee.amount) && (
          <Text style={styles.maxFeeWarningText}>
            {"*" + LL.SendBitcoinConfirmationScreen.maxFeeSelected()}
          </Text>
        )}
      </View>
    </>
  )
}

export default ConfirmationWalletFee

const useStyles = makeStyles(({ colors }) => ({
  fieldContainer: {
    marginBottom: 12,
  },
  fieldBackground: {
    flexDirection: "row",
    borderStyle: "solid",
    overflow: "hidden",
    backgroundColor: colors.grey5,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    height: 60,
  },
  fieldTitleText: {
    fontWeight: "bold",
    marginBottom: 4,
  },
  walletSelectorTypeContainer: {
    marginRight: 20,
  },
  walletSelectorInfoContainer: {
    flex: 1,
    flexDirection: "column",
  },
  walletSelectorTypeTextContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  walletCurrencyText: {
    fontWeight: "bold",
    fontSize: 18,
  },
  walletSelectorBalanceContainer: {
    flex: 1,
    flexDirection: "row",
  },
  maxFeeWarningText: {
    color: colors.warning,
    fontWeight: "bold",
  },
}))
