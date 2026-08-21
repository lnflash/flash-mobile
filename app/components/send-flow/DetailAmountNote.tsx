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
  DisplayCurrency,
  isNonZeroMoneyAmount,
  MoneyAmount,
  toBtcMoneyAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"

// utils
import { testProps } from "../../utils/testProps"
import { LnurlLimits, validateAmountWithinLimits } from "@app/utils/breez-sdk/fee-errors"
import { breezFeeErrorMessage } from "@app/utils/breez-sdk/fee-error-message"
import { lnurlBoundInWalletUnits } from "@app/screens/send-bitcoin-screen/max-send-amount"

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
  const { formatDisplayAndWalletAmount, formatMoneyAmount } = useDisplayCurrency()

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
    // Gate on the realtime price having loaded: until it has, every sat->cent
    // conversion below is NaN and every bound would be meaningless.
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
        // LUD-06 bounds arrive in SATS, and SATS is the unit the receiver
        // actually enforces — so enforce them in sats here too, against the
        // very number the confirm step sends: send-bitcoin-details-screen
        // converts unitOfAccountAmount to BTC and requests exactly that many
        // sats.
        //
        // Two earlier shapes of this check were wrong on the unit. Comparing
        // the sat bound directly to a cash wallet's CENTS read a 100-sat
        // floor as 100 cents, so a Strike address (minSendable 100_000 msat
        // = 100 sats, worth cents) refused every send under $1.00 — over 10x
        // the receiver's real minimum (ENG-556). Converting the bound INTO
        // whole cents fixed that case but broke the default one: the number
        // pad is seeded with zeroDisplayAmount, so it denominates in DISPLAY
        // currency, and use-price-conversion only rounds when the target is
        // BTC — settlementAmount is therefore a FRACTIONAL cent while the
        // quantized bound is a whole one. (JMD display, BTC $65,000,
        // J$158.5/USD, 100-sat floor: J$11.00 is 107 sats, comfortably over
        // the floor, yet 6.94c < 7c refused it.)
        const walletCurrency = paymentDetail.sendingWalletDescriptor.currency

        // Exactly what line "tokens: utils.toSats(btcAmount.amount)" sends.
        // No quantization belongs on this side: convertMoneyAmount already
        // rounds BTC targets to a whole sat and the bound is a whole sat.
        const requestedSats = paymentDetail.convertMoneyAmount(
          paymentDetail.unitOfAccountAmount,
          WalletCurrency.Btc,
        ).amount

        // The MESSAGE, by contrast, is named in the unit the number pad is
        // in — display currency by default, the wallet's own minor unit once
        // the user flips it — so the amount quoted is one the user can
        // actually type. Rounding inward (ceil a minimum, floor a maximum)
        // keeps the quoted entry on the accepted side of the bound; quoting
        // the raw edge would quote an amount the pad cannot produce.
        const padAmount = paymentDetail.unitOfAccountAmount
        const convertSatsToPadUnits = (sats: number) =>
          paymentDetail.convertMoneyAmount(toBtcMoneyAmount(sats), padAmount.currency)
            .amount

        const minInPadUnits = lnurlBoundInWalletUnits({
          sats: paymentDetail.lnurlParams.min,
          convertSatsToWallet: convertSatsToPadUnits,
          rounding: "ceil",
        })
        const maxInPadUnits = lnurlBoundInWalletUnits({
          sats: paymentDetail.lnurlParams.max,
          convertSatsToWallet: convertSatsToPadUnits,
          rounding: "floor",
        })

        const describeBound = (padUnits: number) => {
          const boundAmount: MoneyAmount<WalletOrDisplayCurrency> = {
            amount: padUnits,
            currency: padAmount.currency,
            currencyCode: padAmount.currencyCode,
          }
          const displayAmount = paymentDetail.convertMoneyAmount(
            boundAmount,
            DisplayCurrency,
          )
          const walletAmount = paymentDetail.convertMoneyAmount(
            boundAmount,
            walletCurrency,
          )

          // A USDT wallet amount RENDERS as USD — use-display-currency maps
          // Usdt onto the USD symbol and currency code — but
          // formatDisplayAndWalletAmount's "currencies differ" test compares
          // walletAmount.currency ("USDT") with displayAmount.currencyCode
          // ("USD"), so under a USD display currency it appends a secondary
          // amount and prints the same figure twice: "$0.07 ($0.07 USD)".
          // Name the bound once whenever both sides render as one currency.
          const renderedWalletCurrencyCode =
            walletCurrency === WalletCurrency.Usdt ? "USD" : walletCurrency
          if (renderedWalletCurrencyCode === displayAmount.currencyCode) {
            return formatMoneyAmount({ moneyAmount: boundAmount })
          }

          // Passed through as the formatted string it already is.
          // Coercing it with Number() produced literally "NaN" on screen,
          // because "$0.07" is not a number.
          return formatDisplayAndWalletAmount({
            primaryAmount: boundAmount,
            displayAmount,
            walletAmount,
          })
        }

        // NaN sats means the price is out of sync with the display currency
        // (use-price-conversion records that case and returns NaN). Every
        // comparison against NaN is false, so fall through to no error rather
        // than refusing an amount we cannot price.
        const hasTypedAmount =
          paymentDetail.canSetAmount &&
          isNonZeroMoneyAmount(padAmount) &&
          Number.isFinite(requestedSats)

        if (hasTypedAmount && requestedSats < paymentDetail.lnurlParams.min) {
          setAsyncErrorMessage(
            LL.SendBitcoinScreen.minAmountInvoiceError({
              amount: describeBound(minInPadUnits),
            }),
          )
        } else if (hasTypedAmount && requestedSats > paymentDetail.lnurlParams.max) {
          setAsyncErrorMessage(
            LL.SendBitcoinScreen.maxAmountInvoiceError({
              amount: describeBound(maxInPadUnits),
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
