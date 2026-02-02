import React, { useEffect, useState, useCallback } from "react"
import { View, Alert } from "react-native"
import { makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { getCrashlytics } from "@react-native-firebase/crashlytics"

// components
import { PrimaryBtn } from "@app/components/buttons"
import { SendBitcoinDetailsExtraInfo } from "./send-bitcoin-details-extra-info"
import { Screen } from "@app/components/screen"
import { Fees } from "@app/components/refund-flow"
import {
  ChooseWallet,
  DetailAmountNote,
  DetailDestination,
} from "@app/components/send-flow"

// gql
import {
  useSendBitcoinDetailsScreenQuery,
  useSendBitcoinInternalLimitsQuery,
  useSendBitcoinWithdrawalLimitsQuery,
  WalletCurrency,
} from "@app/graphql/generated"
import { decodeInvoiceString, Network as NetworkLibGaloy } from "@galoymoney/client"
import { getUsdWallet } from "@app/graphql/wallets-utils"

// hooks
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useLevel } from "@app/graphql/level-context"
import {
  useActivityIndicator,
  useBreez,
  useIbexFee,
  usePriceConversion,
} from "@app/hooks"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useI18nContext } from "@app/i18n/i18n-react"
import { usePersistentStateContext } from "@app/store/persistent-state"

// types
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { PaymentDetail } from "./payment-details/index.types"
import { Satoshis } from "lnurl-pay/dist/types/types"

// utils
import { DisplayCurrency, toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import { isValidAmount } from "./payment-details"
import { requestInvoice, utils } from "lnurl-pay"
import { fetchBreezFee, fetchRecommendedFees } from "@app/utils/breez-sdk-spark"

type RecommendedFees = {
  fastestFee: number
  halfHourFee: number
  hourFee: number
  economyFee: number
  minimumFee: number
}

type Props = StackScreenProps<RootStackParamList, "sendBitcoinDetails">

const network = "mainnet" // data?.globals?.network

const SendBitcoinDetailsScreen: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { currentLevel } = useLevel()
  const { btcWallet } = useBreez()
  const { persistentState } = usePersistentStateContext()
  const { convertMoneyAmount: _convertMoneyAmount } = usePriceConversion()
  const { zeroDisplayAmount, formatDisplayAndWalletAmount } = useDisplayCurrency()
  const { toggleActivityIndicator } = useActivityIndicator()
  const getIbexFee = useIbexFee()

  const { paymentDestination, flashUserAddress, isFromFlashcard, invoiceAmount } =
    route.params

  const [recommendedFees, setRecommendedFees] = useState<RecommendedFees>()
  const [isLoadingLnurl, setIsLoadingLnurl] = useState(false)
  const [paymentDetail, setPaymentDetail] = useState<PaymentDetail<WalletCurrency>>()
  const [asyncErrorMessage, setAsyncErrorMessage] = useState("")
  const [selectedFee, setSelectedFee] = useState<number>()
  const [selectedFeeType, setSelectedFeeType] = useState<string>()
  const [isProcessing, setIsProcessing] = useState(false)
  const { data } = useSendBitcoinDetailsScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
    skip: !useIsAuthed(),
  })
  const { data: withdrawalLimitsData } = useSendBitcoinWithdrawalLimitsQuery({
    fetchPolicy: "no-cache",
    skip:
      !useIsAuthed() ||
      !paymentDetail?.paymentType ||
      paymentDetail.paymentType === "intraledger",
  })
  const { data: intraledgerLimitsData } = useSendBitcoinInternalLimitsQuery({
    fetchPolicy: "no-cache",
    skip:
      !useIsAuthed() ||
      !paymentDetail?.paymentType ||
      paymentDetail.paymentType !== "intraledger",
  })

  const defaultWallet = persistentState.defaultWallet

  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)
  const usdBalanceMoneyAmount = toUsdMoneyAmount(usdWallet?.balance)
  const btcBalanceMoneyAmount = toBtcMoneyAmount(btcWallet.balance || btcWallet?.balance)

  useEffect(() => {
    // we are caching the _convertMoneyAmount when the screen loads.
    // this is because the _convertMoneyAmount can change while the user is on this screen
    // and we don't want to update the payment detail with a new convertMoneyAmount
    if (_convertMoneyAmount) {
      setPaymentDetail(
        (paymentDetail) =>
          paymentDetail && paymentDetail.setConvertMoneyAmount(_convertMoneyAmount),
      )
    }
  }, [_convertMoneyAmount])

  // we set the default values when the screen loads
  // this only run once (doesn't re-run after paymentDetail is set)
  useEffect(() => {
    if (!(paymentDetail || !defaultWallet || !_convertMoneyAmount)) {
      let initialPaymentDetail = paymentDestination.createPaymentDetail({
        convertMoneyAmount: _convertMoneyAmount,
        sendingWalletDescriptor: {
          id: defaultWallet.id,
          currency: defaultWallet.walletCurrency,
        },
      })

      // Start with usd as the unit of account
      if (initialPaymentDetail.canSetAmount) {
        initialPaymentDetail = initialPaymentDetail.setAmount(zeroDisplayAmount)
      }

      setPaymentDetail(initialPaymentDetail)
    }
  }, [
    paymentDestination,
    _convertMoneyAmount,
    paymentDetail,
    defaultWallet,
    zeroDisplayAmount,
  ])

  useEffect(() => {
    if (
      paymentDetail &&
      paymentDetail.sendingWalletDescriptor.currency === "BTC" &&
      paymentDetail.paymentType === "onchain" &&
      !recommendedFees
    ) {
      fetchBreezRecommendedFees()
    }
  }, [paymentDetail?.sendingWalletDescriptor, paymentDetail?.paymentType])

  const fetchBreezRecommendedFees = async () => {
    toggleActivityIndicator(true)
    const recommendedFees = await fetchRecommendedFees()
    setRecommendedFees(recommendedFees)
    toggleActivityIndicator(false)
  }

  const fetchSendingFee = async (pd: PaymentDetail<WalletCurrency>) => {
    if (pd) {
      if (pd?.sendingWalletDescriptor.currency === "BTC") {
        const { fee, err }: { fee: any; err: any } = await fetchBreezFee(
          pd?.paymentType,
          !!flashUserAddress ? flashUserAddress : pd?.destination,
          pd?.settlementAmount.amount,
          selectedFee, // feeRateSatPerVbyte
          pd.isSendingMax,
        )
        if (fee === null && err) {
          const error = err?.message || err
          const errMsg = error.includes("not enough funds")
            ? `${error} (amount + fee)`
            : error
          setAsyncErrorMessage(errMsg)
          return false
        }
      } else {
        const estimatedFee = await getIbexFee(pd.getFee)
        if (
          _convertMoneyAmount &&
          estimatedFee &&
          pd.settlementAmount.amount + estimatedFee?.amount > usdBalanceMoneyAmount.amount
        ) {
          const amount = formatDisplayAndWalletAmount({
            displayAmount: _convertMoneyAmount(usdBalanceMoneyAmount, DisplayCurrency),
            walletAmount: usdBalanceMoneyAmount,
          })
          setAsyncErrorMessage(
            LL.SendBitcoinScreen.amountExceed({
              balance: amount,
            }) + "(amount + fee)",
          )
          return false
        }
      }
      return true
    }
  }

  // Add timeout wrapper for operations
  const withTimeout = useCallback(
    <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
            timeoutMs,
          )
        }),
      ])
    },
    [],
  )

  // Safe error handler that prevents app freezing
  const handleCriticalError = useCallback(
    (error: any, context: string) => {
      console.error(`Critical error in ${context}:`, error)
      getCrashlytics().recordError(
        error instanceof Error ? error : new Error(String(error)),
      )

      // Show user-friendly error and offer to reload
      Alert.alert(
        "Something went wrong",
        `There was an issue processing your request. Would you like to try again or go back?`,
        [
          {
            text: "Go Back",
            onPress: () => navigation.goBack(),
            style: "cancel",
          },
          {
            text: "Try Again",
            onPress: () => {
              setAsyncErrorMessage("")
              setIsProcessing(false)
              setIsLoadingLnurl(false)
              toggleActivityIndicator(false)
            },
          },
        ],
      )
    },
    [navigation, toggleActivityIndicator],
  )

  const goToNextScreen =
    (paymentDetail?.sendPaymentMutation ||
      (paymentDetail?.paymentType === "lnurl" && paymentDetail?.unitOfAccountAmount)) &&
    (async () => {
      if (isProcessing) return

      try {
        setIsProcessing(true)
        toggleActivityIndicator(true)
        let paymentDetailForConfirmation: PaymentDetail<WalletCurrency> = paymentDetail

        if (paymentDetail.paymentType === "lnurl") {
          const lnurlParams = paymentDetail?.lnurlParams
          try {
            setIsLoadingLnurl(true)

            const btcAmount = paymentDetail.convertMoneyAmount(
              paymentDetail.unitOfAccountAmount,
              "BTC",
            )

            const requestInvoiceParams: {
              lnUrlOrAddress: string
              tokens: Satoshis
              comment?: string
            } = {
              lnUrlOrAddress: paymentDetail.destination,
              tokens: utils.toSats(btcAmount.amount),
            }

            if (lnurlParams?.commentAllowed) {
              requestInvoiceParams.comment = paymentDetail.memo
            }

            // Add timeout to LNURL request (30 seconds)
            const result = await withTimeout(requestInvoice(requestInvoiceParams), 30000)

            setIsLoadingLnurl(false)
            const invoice = result.invoice
            const decodedInvoice = decodeInvoiceString(
              invoice,
              network as NetworkLibGaloy,
            )

            const invoiceAmountSats = Math.round(
              Number(decodedInvoice.millisatoshis) / 1000,
            )
            const requestedAmountSats = btcAmount.amount
            const amountDifference = Math.abs(invoiceAmountSats - requestedAmountSats)

            // For flashcard reloads, allow small rounding differences (up to 15 sats)
            // This accommodates flashcard servers that may round amounts
            if (isFromFlashcard) {
              if (amountDifference > 15) {
                setAsyncErrorMessage(
                  `Flashcard server returned ${invoiceAmountSats} sats but you requested ${requestedAmountSats} sats. Please try a different amount.`,
                )
                return
              }
              // Use the amount from the invoice for flashcard reloads to handle rounding
              const adjustedBtcAmount = toBtcMoneyAmount(invoiceAmountSats)
              paymentDetailForConfirmation = paymentDetail.setInvoice({
                paymentRequest: invoice,
                paymentRequestAmount: adjustedBtcAmount,
              })
            } else {
              // For regular LNURL payments, maintain strict validation
              if (invoiceAmountSats !== requestedAmountSats) {
                setAsyncErrorMessage(LL.SendBitcoinScreen.lnurlInvoiceIncorrectAmount())
                return
              }
              paymentDetailForConfirmation = paymentDetail.setInvoice({
                paymentRequest: invoice,
                paymentRequestAmount: btcAmount,
              })
            }
          } catch (error) {
            setIsLoadingLnurl(false)
            if (error instanceof Error) {
              getCrashlytics().recordError(error)
              if (error.message.includes("timed out")) {
                setAsyncErrorMessage(
                  "Request timed out. Please check your connection and try again.",
                )
              } else {
                setAsyncErrorMessage(LL.SendBitcoinScreen.failedToFetchLnurlInvoice())
              }
            } else {
              setAsyncErrorMessage("An unexpected error occurred. Please try again.")
            }
            return
          }
        }

        const res = await withTimeout(
          fetchSendingFee(paymentDetailForConfirmation),
          15000,
        )

        if (res && paymentDetailForConfirmation.sendPaymentMutation) {
          navigation.navigate("sendBitcoinConfirmation", {
            paymentDetail: paymentDetailForConfirmation,
            flashUserAddress,
            feeRateSatPerVbyte: selectedFee,
            invoiceAmount,
          })
        }
      } catch (error) {
        handleCriticalError(error, "goToNextScreen")
      } finally {
        setIsProcessing(false)
        toggleActivityIndicator(false)
        setIsLoadingLnurl(false)
      }
    })

  const onSelectFee = (type: string, value?: number) => {
    setSelectedFeeType(type)
    setSelectedFee(value)
  }

  const amountStatus = isValidAmount({
    paymentDetail,
    usdWalletAmount: usdBalanceMoneyAmount,
    btcWalletAmount: btcBalanceMoneyAmount,
    intraledgerLimits: intraledgerLimitsData?.me?.defaultAccount?.limits?.internalSend,
    withdrawalLimits: withdrawalLimitsData?.me?.defaultAccount?.limits?.withdrawal,
    isFromFlashcard,
  })

  const isDisabled =
    !amountStatus.validAmount ||
    Boolean(asyncErrorMessage) ||
    isProcessing ||
    isLoadingLnurl ||
    (paymentDetail?.sendingWalletDescriptor.currency === "BTC" &&
      paymentDetail.paymentType === "onchain" &&
      !selectedFee)

  if (paymentDetail) {
    return (
      <Screen
        preset="scroll"
        style={styles.screenStyle}
        keyboardOffset="navigationHeader"
        keyboardShouldPersistTaps="handled"
      >
        <ChooseWallet
          usdWallet={usdWallet}
          wallets={data?.me?.defaultAccount?.wallets as any[]}
          paymentDetail={paymentDetail}
          setPaymentDetail={setPaymentDetail}
        />
        <DetailDestination
          flashUserAddress={flashUserAddress}
          paymentDetail={paymentDetail}
        />
        <DetailAmountNote
          selectedFee={selectedFee}
          usdWallet={usdWallet}
          paymentDetail={paymentDetail}
          setPaymentDetail={setPaymentDetail}
          setAsyncErrorMessage={setAsyncErrorMessage}
          isFromFlashcard={isFromFlashcard}
          invoiceAmount={invoiceAmount}
        />
        {paymentDetail.sendingWalletDescriptor.currency === "BTC" &&
          paymentDetail.paymentType === "onchain" && (
            <Fees
              wrapperStyle={{ marginTop: 0 }}
              recommendedFees={recommendedFees}
              selectedFeeType={selectedFeeType}
              onSelectFee={onSelectFee}
            />
          )}
        <SendBitcoinDetailsExtraInfo
          errorMessage={asyncErrorMessage}
          amountStatus={amountStatus}
          currentLevel={currentLevel}
        />
        <View style={styles.buttonContainer}>
          <PrimaryBtn
            onPress={goToNextScreen || undefined}
            loading={isLoadingLnurl}
            disabled={isDisabled}
            label={LL.common.next()}
          />
        </View>
      </Screen>
    )
  } else {
    return null
  }
}
export default SendBitcoinDetailsScreen

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    padding: 20,
    flexGrow: 1,
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
}))
