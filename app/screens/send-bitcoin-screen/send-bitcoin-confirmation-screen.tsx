import React, { useCallback, useEffect, useState } from "react"
import { View } from "react-native"
import { makeStyles } from "@rneui/themed"
import { useI18nContext } from "@app/i18n/i18n-react"
import crashlytics from "@react-native-firebase/crashlytics"
import { StackScreenProps } from "@react-navigation/stack"
import ReactNativeHapticFeedback from "react-native-haptic-feedback"

// components
import {
  ConfirmationDestinationAmountNote,
  ConfirmationError,
  ConfirmationWalletFee,
} from "@app/components/send-flow"
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

// hooks
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useSendPayment } from "./use-send-payment"
import { useActivityIndicator, useBreez } from "@app/hooks"
import { useIsAuthed } from "@app/graphql/is-authed-context"

// types
import {
  addMoneyAmounts,
  DisplayCurrency,
  lessThanOrEqualTo,
  moneyAmountIsCurrencyType,
  toBtcMoneyAmount,
  toUsdMoneyAmount,
  ZeroBtcMoneyAmount,
  ZeroUsdMoneyAmount,
} from "@app/types/amounts"
import {
  useNpubByUsernameLazyQuery,
  useSendBitcoinConfirmationScreenQuery,
  WalletCurrency,
} from "@app/graphql/generated"
import { FeeType } from "./use-fee"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// utils
import { logPaymentAttempt, logPaymentResult } from "@app/utils/analytics"
import { getUsdWallet } from "@app/graphql/wallets-utils"
import { useChatContext } from "../chat/chatContext"
import { addToContactList, getSecretKey } from "@app/utils/nostr"
import { nip19 } from "nostr-tools"
import { useConfirmOverwrite } from "./confirm-contact-override-modal"

type Props = {} & StackScreenProps<RootStackParamList, "sendBitcoinConfirmation">

const SendBitcoinConfirmationScreen: React.FC<Props> = ({ route, navigation }) => {
  const { paymentDetail, flashUserAddress, feeRateSatPerVbyte, invoiceAmount } =
    route.params
  const {
    paymentType,
    sendingWalletDescriptor,
    sendPaymentMutation,
    settlementAmount,
    isSendingMax,
    convertMoneyAmount,
  } = paymentDetail

  const styles = useStyles()
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()

  const { formatDisplayAndWalletAmount } = useDisplayCurrency()
  const { toggleActivityIndicator } = useActivityIndicator()

  const [usdWalletText, setUsdWalletText] = useState("")
  const [btcWalletText, setBtcWalletText] = useState("")
  const [isValidAmount, setIsValidAmount] = useState(true)
  const [paymentError, setPaymentError] = useState<string>()
  const [invalidAmountErr, setInvalidAmountErr] = useState<string>()
  const [fee, setFee] = useState<FeeType>({ status: "loading" })
  const { contactsEvent, poolRef } = useChatContext()
  const [npubByUsernameQuery] = useNpubByUsernameLazyQuery()
  const { confirmOverwrite, ModalComponent: ConfirmOverwriteModal } =
    useConfirmOverwrite()

  const { data } = useSendBitcoinConfirmationScreenQuery({ skip: !useIsAuthed() })
  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)

  const {
    loading: sendPaymentLoading,
    sendPayment,
    hasAttemptedSend,
  } = useSendPayment(sendPaymentMutation, paymentDetail, feeRateSatPerVbyte)

  useEffect(() => {
    setWalletText()
    validateAmount()
  }, [usdWallet, btcWallet, fee])

  const setWalletText = () => {
    const btcBalanceMoneyAmount = toBtcMoneyAmount(btcWallet?.balance)
    const usdBalanceMoneyAmount = toUsdMoneyAmount(usdWallet?.balance)

    const btcWalletText = formatDisplayAndWalletAmount({
      displayAmount: convertMoneyAmount(btcBalanceMoneyAmount, DisplayCurrency),
      walletAmount: btcBalanceMoneyAmount,
    })
    const usdWalletText = formatDisplayAndWalletAmount({
      displayAmount: convertMoneyAmount(usdBalanceMoneyAmount, DisplayCurrency),
      walletAmount: usdBalanceMoneyAmount,
    })
    setBtcWalletText(btcWalletText)
    setUsdWalletText(usdWalletText)
  }

  const validateAmount = () => {
    const btcBalanceMoneyAmount = toBtcMoneyAmount(btcWallet?.balance)
    const usdBalanceMoneyAmount = toUsdMoneyAmount(usdWallet?.balance)

    if (
      moneyAmountIsCurrencyType(settlementAmount, WalletCurrency.Btc) &&
      btcBalanceMoneyAmount &&
      !isSendingMax
    ) {
      const totalAmount = addMoneyAmounts({
        a: settlementAmount,
        b: fee.amount || ZeroBtcMoneyAmount,
      })
      const validAmount = lessThanOrEqualTo({
        value: totalAmount,
        lessThanOrEqualTo: btcBalanceMoneyAmount,
      })
      if (!validAmount) {
        const invalidAmountErrorMessage = LL.SendBitcoinScreen.amountExceed({
          balance: btcWalletText,
        })
        setInvalidAmountErr(invalidAmountErrorMessage)
      }
      setIsValidAmount(validAmount)
    }

    if (
      moneyAmountIsCurrencyType(settlementAmount, WalletCurrency.Usd) &&
      usdBalanceMoneyAmount &&
      !isSendingMax
    ) {
      const totalAmount = addMoneyAmounts({
        a: settlementAmount,
        b: fee.amount || ZeroUsdMoneyAmount,
      })
      const validAmount = lessThanOrEqualTo({
        value: totalAmount,
        lessThanOrEqualTo: usdBalanceMoneyAmount,
      })
      if (!validAmount) {
        const invalidAmountErrorMessage = LL.SendBitcoinScreen.amountExceed({
          balance: usdWalletText,
        })
        setInvalidAmountErr(invalidAmountErrorMessage)
      }
      setIsValidAmount(validAmount)
    }
  }

  const handleSendPayment = useCallback(async () => {
    if (sendPayment && sendingWalletDescriptor?.currency) {
      console.log("Starting animation and sending payment")
      try {
        logPaymentAttempt({
          paymentType: paymentDetail.paymentType,
          sendingWallet: sendingWalletDescriptor.currency,
        })
        toggleActivityIndicator(true)
        const { status, errorsMessage } = await sendPayment()
        toggleActivityIndicator(false)
        logPaymentResult({
          paymentType: paymentDetail.paymentType,
          paymentStatus: status,
          sendingWallet: sendingWalletDescriptor.currency,
        })

        if (status === "SUCCESS" || status === "PENDING") {
          if (flashUserAddress && poolRef) {
            try {
              const flashUsername = flashUserAddress.split("@")[0]
              const queryResult = await npubByUsernameQuery({
                variables: { username: flashUsername },
              })
              const destinationNpub = queryResult.data?.npubByUsername?.npub
              if (destinationNpub) {
                const secretKey = await getSecretKey()
                if (secretKey) {
                  await addToContactList(
                    secretKey,
                    nip19.decode(destinationNpub).data as string,
                    poolRef.current,
                    confirmOverwrite,
                    contactsEvent,
                  )
                }
              } else {
                console.warn("Could not resolve flash username to npub", flashUsername)
              }
            } catch (err) {
              console.warn("Failed to auto-add flash user to contacts", err)
            }
          }
          navigation.navigate("sendBitcoinSuccess", {
            walletCurrency: sendingWalletDescriptor.currency,
            unitOfAccountAmount:
              sendingWalletDescriptor.currency === "USD" && invoiceAmount
                ? invoiceAmount
                : paymentDetail.unitOfAccountAmount,
          })
          ReactNativeHapticFeedback.trigger("notificationSuccess", {
            ignoreAndroidSystemSettings: true,
          })
        } else if (status === "ALREADY_PAID") {
          setPaymentError("Invoice is already paid")
          ReactNativeHapticFeedback.trigger("notificationError", {
            ignoreAndroidSystemSettings: true,
          })
        } else {
          setPaymentError(errorsMessage || "Something went wrong")
          ReactNativeHapticFeedback.trigger("notificationError", {
            ignoreAndroidSystemSettings: true,
          })
        }
      } catch (err) {
        if (err instanceof Error) {
          crashlytics().recordError(err)
          setPaymentError(err.message || err.toString())
        }
      }
    } else {
      return null
    }
  }, [paymentType, sendPayment, sendingWalletDescriptor?.currency])

  return (
    <Screen preset="scroll" style={styles.screenStyle} keyboardOffset="navigationHeader">
      <ConfirmationDestinationAmountNote
        paymentDetail={paymentDetail}
        invoiceAmount={invoiceAmount}
      />
      <ConfirmationWalletFee
        flashUserAddress={flashUserAddress}
        paymentDetail={paymentDetail}
        btcWalletText={btcWalletText}
        usdWalletText={usdWalletText}
        feeRateSatPerVbyte={feeRateSatPerVbyte}
        fee={fee}
        setFee={setFee}
        setPaymentError={setPaymentError}
      />
      <ConfirmationError
        paymentError={paymentError}
        invalidAmountErrorMessage={invalidAmountErr}
      />
      <View style={styles.buttonContainer}>
        <PrimaryBtn
          loading={sendPaymentLoading}
          label={LL.SendBitcoinConfirmationScreen.title()}
          disabled={!isValidAmount || hasAttemptedSend}
          onPress={handleSendPayment}
        />
      </View>
      <ConfirmOverwriteModal />
    </Screen>
  )
}

export default SendBitcoinConfirmationScreen

const useStyles = makeStyles(({ colors }) => ({
  buttonContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  screenStyle: {
    padding: 20,
    flexGrow: 1,
  },
}))
