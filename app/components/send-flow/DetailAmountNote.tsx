import React, { useEffect, useState } from "react"
import { View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
import { useI18nContext } from "@app/i18n/i18n-react"

// hooks
import { useBreez, useDisplayCurrency, usePriceConversion } from "@app/hooks"

// components
import { GaloyTertiaryButton } from "@app/components/atomic/galoy-tertiary-button"
import { AmountInput } from "@app/components/amount-input/amount-input"
import { NoteInput } from "@app/components/note-input"

// types
import { RecommendedFees } from "@breeztech/react-native-breez-sdk-liquid"
import { PaymentDetail } from "@app/screens/send-bitcoin-screen/payment-details"
import { WalletCurrency } from "@app/graphql/generated"
import {
  isNonZeroMoneyAmount,
  MoneyAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"

// utils
import { testProps } from "../../utils/testProps"
import {
  fetchBreezFee,
  fetchBreezLightningLimits,
  fetchBreezOnChainLimits,
} from "@app/utils/breez-sdk-liquid"

type Props = {
  selectedFee?: number
  usdWallet: any
  paymentDetail: PaymentDetail<WalletCurrency>
  setPaymentDetail: (val: PaymentDetail<WalletCurrency>) => void
  setAsyncErrorMessage: (val: string) => void
  isFromFlashcard?: boolean
}

const DetailAmountNote: React.FC<Props> = ({
  selectedFee,
  usdWallet,
  paymentDetail,
  setPaymentDetail,
  setAsyncErrorMessage,
  isFromFlashcard,
}) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()
  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  const { sendingWalletDescriptor } = paymentDetail

  const [minAmount, setMinAmount] = useState<MoneyAmount<WalletCurrency>>()
  const [maxAmount, setMaxAmount] = useState<MoneyAmount<WalletCurrency>>()

  useEffect(() => {
    if (paymentDetail.isSendingMax && selectedFee) {
      sendAll()
    }
  }, [selectedFee, paymentDetail.isSendingMax])

  useEffect(() => {
    fetchBtcMinMaxAmount()
  }, [paymentDetail.sendingWalletDescriptor.currency])

  const fetchBtcMinMaxAmount = async () => {
    if (paymentDetail.sendingWalletDescriptor.currency === "BTC") {
      let limits
      if (paymentDetail.paymentType === "lightning") {
        limits = await fetchBreezLightningLimits()
      } else if (paymentDetail.paymentType === "onchain") {
        limits = await fetchBreezOnChainLimits()
      } else {
        limits = await fetchBreezLightningLimits()
        if (paymentDetail?.paymentType === "lnurl") {
          limits = {
            send: {
              minSat:
                limits.send.minSat < paymentDetail?.lnurlParams.min
                  ? paymentDetail?.lnurlParams.min
                  : limits.send.minSat,
              maxSat:
                limits.send.maxSat > paymentDetail?.lnurlParams.max
                  ? paymentDetail?.lnurlParams.max
                  : limits.send.maxSat,
            },
          }
        }
      }

      const defaultMinSat = limits?.send.minSat || 0
      const flashcardMinSat = isFromFlashcard ? 100 : 0
      const minSat = Math.max(defaultMinSat, flashcardMinSat)

      setMinAmount({
        amount: minSat,
        currency: "BTC",
        currencyCode: "SAT",
      })
      setMaxAmount({
        amount: limits?.send.maxSat || 0,
        currency: "BTC",
        currencyCode: "SAT",
      })
    } else {
      setMinAmount({
        amount: 1,
        currency: "USD",
        currencyCode: "USD",
      })
      setMaxAmount(undefined)
    }
  }

  useEffect(() => {
    checkErrorMessage()
  }, [paymentDetail, minAmount, maxAmount])

  const checkErrorMessage = () => {
    if (!convertMoneyAmount) return null
    if (paymentDetail?.sendingWalletDescriptor.currency === "BTC") {
      if (paymentDetail.paymentType === "lightning" && paymentDetail.canSetAmount) {
        setAsyncErrorMessage(LL.SendBitcoinScreen.noAmountInvoiceError())
      } else if (
        minAmount &&
        paymentDetail.settlementAmount.amount &&
        paymentDetail.settlementAmount.amount < minAmount?.amount
      ) {
        const convertedBTCAmount = convertMoneyAmount(minAmount, "DisplayCurrency")
        const formattedBTCAmount = formatDisplayAndWalletAmount({
          displayAmount: convertedBTCAmount,
          walletAmount: minAmount,
        })
        if (paymentDetail.paymentType === "onchain") {
          setAsyncErrorMessage(
            LL.SendBitcoinScreen.onchainMinAmountInvoiceError({
              amount: formattedBTCAmount,
            }),
          )
        } else {
          setAsyncErrorMessage(
            LL.SendBitcoinScreen.minAmountInvoiceError({
              amount: formattedBTCAmount,
            }),
          )
        }
      } else if (
        maxAmount &&
        paymentDetail.settlementAmount.amount &&
        paymentDetail.settlementAmount.amount > maxAmount?.amount
      ) {
        const convertedBTCAmount = convertMoneyAmount(maxAmount, "DisplayCurrency")
        setAsyncErrorMessage(
          LL.SendBitcoinScreen.maxAmountInvoiceError({
            amount: formatDisplayAndWalletAmount({
              displayAmount: convertedBTCAmount,
              walletAmount: maxAmount,
            }),
          }),
        )
      } else {
        setAsyncErrorMessage("")
      }
    } else {
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
              amount: formatDisplayAndWalletAmount({
                displayAmount: convertedUSDAmount,
                walletAmount: minAmount,
              }),
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
              amount: formatDisplayAndWalletAmount({
                displayAmount: convertedUSDAmount,
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
            unitOfAccountAmount={paymentDetail.unitOfAccountAmount}
            setAmount={setAmount}
            convertMoneyAmount={paymentDetail.convertMoneyAmount}
            walletCurrency={sendingWalletDescriptor.currency}
            canSetAmount={paymentDetail.canSetAmount}
            isSendingMax={paymentDetail.isSendingMax}
            maxAmount={maxAmount}
            minAmount={minAmount}
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
