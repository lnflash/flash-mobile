import React, { useEffect, useState } from "react"
import { makeStyles, Text } from "@rneui/themed"
import { View } from "react-native"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import {
  useBreez,
  useDisplayCurrency,
  useFormatSats,
  usePriceConversion,
} from "@app/hooks"

// components
import { GaloyTertiaryButton } from "@app/components/atomic/galoy-tertiary-button"
import { AmountInput } from "@app/components/amount-input/amount-input"
import { MaxAmountButton } from "@app/components/amount-input-screen"
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
import { LnurlLimits, validateAmountWithinLimits } from "@app/utils/breez-sdk/fee-errors"
import { breezFeeErrorMessage } from "@app/utils/breez-sdk/fee-error-message"

type Props = {
  selectedFeeType?: "fast" | "medium" | "slow"
  usdWallet: any
  paymentDetail: PaymentDetail<WalletCurrency>
  setPaymentDetail: (val: PaymentDetail<WalletCurrency>) => void
  setAsyncErrorMessage: (val: string) => void
  invoiceAmount?: MoneyAmount<WalletCurrency>
  receiverLimits?: LnurlLimits | null
  maxAmountButton?: MaxAmountButton
}

const DetailAmountNote: React.FC<Props> = ({
  selectedFeeType,
  usdWallet,
  paymentDetail,
  setPaymentDetail,
  setAsyncErrorMessage,
  invoiceAmount,
  receiverLimits,
  maxAmountButton,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentDetail, receiverLimits])

  const formatSats = useFormatSats()

  const checkErrorMessage = () => {
    if (!convertMoneyAmount) return null
    if (
      paymentDetail?.sendingWalletDescriptor.currency === "BTC" &&
      (paymentDetail?.paymentType === "intraledger" ||
        paymentDetail?.paymentType === "lnurl")
    ) {
      // BTC wallet pays these destinations via LNURL-pay — validate against
      // the receiver's advertised limits as the user types.
      if (
        paymentDetail.canSetAmount &&
        isNonZeroMoneyAmount(paymentDetail.settlementAmount)
      ) {
        const limitErr = validateAmountWithinLimits(
          paymentDetail.settlementAmount.amount,
          receiverLimits ?? null,
        )
        setAsyncErrorMessage(
          limitErr ? breezFeeErrorMessage(limitErr, LL, formatSats) : "",
        )
      }
      return null
    }
    if (
      paymentDetail?.sendingWalletDescriptor.currency === "USD" ||
      paymentDetail?.sendingWalletDescriptor.currency === "USDT"
    ) {
      if (paymentDetail?.paymentType === "lnurl") {
        // LUD-06 bounds arrive in SATS; settlementAmount is in the sending
        // wallet's minor units, which is CENTS on this branch. Comparing them
        // directly read a 100-sat floor as 100 cents, so a Strike address
        // (minSendable 100_000 msat = 100 sats, worth cents) refused every
        // send under $1.00 — over 10x the receiver's real minimum. Convert
        // the bound into wallet units and compare like with like.
        const walletCurrency = paymentDetail.sendingWalletDescriptor.currency
        const satBound = (sats: number): MoneyAmount<WalletCurrency> => ({
          amount: sats,
          currency: "BTC",
          currencyCode: "SAT",
        })
        const inWalletUnits = (sats: number) =>
          convertMoneyAmount(satBound(sats), walletCurrency).amount

        if (
          paymentDetail.canSetAmount &&
          isNonZeroMoneyAmount(paymentDetail.settlementAmount) &&
          paymentDetail.settlementAmount.amount <
            inWalletUnits(paymentDetail.lnurlParams.min)
        ) {
          const minAmount = satBound(paymentDetail.lnurlParams.min)
          setAsyncErrorMessage(
            LL.SendBitcoinScreen.minAmountInvoiceError({
              // Passed through as the formatted string it already is.
              // Coercing it with Number() produced literally "NaN" on screen,
              // because "$0.07 (100 sats)" is not a number.
              amount: formatDisplayAndWalletAmount({
                displayAmount: convertMoneyAmount(minAmount, "DisplayCurrency"),
                walletAmount: minAmount,
              }),
            }),
          )
        } else if (
          paymentDetail.canSetAmount &&
          isNonZeroMoneyAmount(paymentDetail.settlementAmount) &&
          paymentDetail.settlementAmount.amount >
            inWalletUnits(paymentDetail.lnurlParams.max)
        ) {
          const maxAmount = satBound(paymentDetail.lnurlParams.max)
          setAsyncErrorMessage(
            LL.SendBitcoinScreen.maxAmountInvoiceError({
              amount: formatDisplayAndWalletAmount({
                displayAmount: convertMoneyAmount(maxAmount, "DisplayCurrency"),
                walletAmount: maxAmount,
              }),
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
              (sendingWalletDescriptor.currency === "USD" ||
                sendingWalletDescriptor.currency === "USDT") &&
              invoiceAmount
                ? invoiceAmount
                : paymentDetail.unitOfAccountAmount
            }
            setAmount={setAmount}
            convertMoneyAmount={paymentDetail.convertMoneyAmount}
            walletCurrency={sendingWalletDescriptor.currency}
            canSetAmount={paymentDetail.canSetAmount}
            isSendingMax={paymentDetail.isSendingMax}
            maxAmountButton={maxAmountButton}
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
