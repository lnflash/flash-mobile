import React, { useEffect, useRef } from "react"
import { ActivityIndicator, View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { makeStyles, Text } from "@rneui/themed"

// hooks
import useFee, { FeeType } from "@app/screens/send-bitcoin-screen/use-fee"

import { shouldDiscloseFeeFromAmount } from "./fee-from-amount.logic"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useFormatSats } from "@app/hooks/use-format-sats"

// types
import { WalletCurrency } from "@app/graphql/generated"
import { PaymentDetail } from "@app/screens/send-bitcoin-screen/payment-details"
import { DisplayCurrency } from "@app/types/amounts"

// utils
import { testProps } from "@app/utils/testProps"
import { fetchBreezFee } from "@app/utils/breez-sdk"
import { breezFeeErrorMessage } from "@app/utils/breez-sdk/fee-error-message"

// assets
import Cash from "@app/assets/icons/cash.svg"
import Bitcoin from "@app/assets/icons/bitcoin.svg"

type Props = {
  flashUserAddress?: string
  paymentDetail: PaymentDetail<WalletCurrency>
  btcWalletText: string
  usdWalletText: string
  selectedFeeType?: "fast" | "medium" | "slow"
  fee: FeeType
  setFee: (fee: FeeType) => void
  setPaymentError: (val: string) => void
}

const ConfirmationWalletFee: React.FC<Props> = ({
  flashUserAddress,
  paymentDetail,
  btcWalletText,
  usdWalletText,
  selectedFeeType,
  fee,
  setFee,
  setPaymentError,
}) => {
  const { sendingWalletDescriptor, getFee, settlementAmount, paymentType } = paymentDetail
  const { LL } = useI18nContext()
  const styles = useStyles()
  const isGaloyWalletSend =
    sendingWalletDescriptor.currency === "USD" ||
    sendingWalletDescriptor.currency === "USDT"
  // The galoy fee probe only applies to USD/USDT sends. For the Breez BTC
  // wallet it queried galoy with a non-galoy wallet id (guaranteed error), and
  // each state transition of the probe re-fired the Breez quote fetch below —
  // overlapping fetches whose transient failure left a stale, sticky
  // paymentError that kept Confirm disabled under a successfully loaded fee.
  const getLightningFee = useFee(isGaloyWalletSend && getFee ? getFee : null)
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()
  const formatSats = useFormatSats()
  const breezFeeRequestId = useRef(0)
  // True only while the current paymentError was set by the quote effect
  // below. The screen also writes paymentError (send failures), and Confirm
  // stays enabled while a quote is still loading — so a quote resolving
  // successfully after a failed send must not wipe the send-failure message.
  const feeErrorActive = useRef(false)

  useEffect(() => {
    if (!isGaloyWalletSend) return
    setFee(getLightningFee)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGaloyWalletSend, getLightningFee])

  useEffect(() => {
    if (isGaloyWalletSend) return
    breezFeeRequestId.current += 1
    const requestId = breezFeeRequestId.current
    const fetchQuote = async () => {
      setFee({ status: "loading", amount: undefined })
      const { fee, err } = await fetchBreezFee({
        paymentType,
        paymentRequest: flashUserAddress || paymentDetail.destination,
        amountSats: settlementAmount.amount,
        selectedFeeType,
      })
      // A newer fetch owns the state — a stale result (success or failure)
      // must not overwrite it.
      if (requestId !== breezFeeRequestId.current) return
      if (fee !== null) {
        setFee({
          status: "set",
          amount: { amount: fee, currency: "BTC", currencyCode: "BTC" },
        })
        // Clear a fee error a previous attempt left behind, or Confirm stays
        // disabled under a successfully loaded fee. Scoped to errors this
        // effect set: clearing unconditionally would wipe a send-failure
        // error the screen set while this quote was still in flight.
        if (feeErrorActive.current) {
          setPaymentError("")
          feeErrorActive.current = false
        }
      } else if (err) {
        setFee({
          status: "error",
          amount: undefined,
        })
        setPaymentError(breezFeeErrorMessage(err, LL, formatSats))
        feeErrorActive.current = true
      } else {
        setFee({
          status: "unset",
          amount: undefined,
        })
      }
    }
    fetchQuote()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isGaloyWalletSend,
    paymentType,
    flashUserAddress,
    paymentDetail.destination,
    settlementAmount.amount,
    selectedFeeType,
  ])

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
        {shouldDiscloseFeeFromAmount({
          paymentType,
          sendingWalletCurrency: sendingWalletDescriptor.currency,
          feeStatus: fee.status,
          feeAmount: fee.amount?.amount,
        }) && (
          <Text
            {...testProps("Fee From Amount Disclosure")}
            style={styles.maxFeeWarningText}
          >
            {LL.SendBitcoinConfirmationScreen.feeDeductedFromAmount()}
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
