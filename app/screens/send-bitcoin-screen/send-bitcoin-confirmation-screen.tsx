import React, { useCallback, useEffect, useState } from "react"
import { View } from "react-native"
import { makeStyles } from "@rneui/themed"
import { useI18nContext } from "@app/i18n/i18n-react"
import { getCrashlytics } from "@react-native-firebase/crashlytics"
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
import {
  decodeInvoiceString,
  Network as NetworkLibGaloy,
  PaymentType,
} from "@galoymoney/client"
import {
  isHeldInvoiceExpired,
  noteInvoiceFirstSight,
  willTransmitHeldInvoice,
} from "./invoice-expiry"
import { useActivityIndicator, useBreez } from "@app/hooks"
import { useIsAuthed } from "@app/graphql/is-authed-context"

// types
import {
  addMoneyAmounts,
  DisplayCurrency,
  lessThanOrEqualTo,
  moneyAmountIsCurrencyType,
  toBtcMoneyAmount,
  toSpendableBalance,
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
import {
  logPaymentAttempt,
  logPaymentBlockedExpiredInvoice,
  logPaymentResult,
} from "@app/utils/analytics"
import { getCashWallet } from "@app/graphql/wallets-utils"
import { useChatContext } from "../chat/chatContext"
import { addToContactList } from "@app/utils/nostr"
import { getSigner } from "@app/nostr/signer"
import { nip19 } from "nostr-tools"
import { useRequireContactList } from "./require-contact-list-modal"

type Props = {} & StackScreenProps<RootStackParamList, "sendBitcoinConfirmation">

const SendBitcoinConfirmationScreen: React.FC<Props> = ({ route, navigation }) => {
  const { paymentDetail, flashUserAddress, selectedFeeType, invoiceAmount } = route.params
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
  const { contactsEvent } = useChatContext()
  const [npubByUsernameQuery] = useNpubByUsernameLazyQuery()
  const { promptForContactList, ModalComponent: ConfirmOverwriteModal } =
    useRequireContactList()

  const { data } = useSendBitcoinConfirmationScreenQuery({ skip: !useIsAuthed() })
  const usdWallet = getCashWallet(data?.me?.defaultAccount?.wallets)

  const {
    loading: sendPaymentLoading,
    sendPayment,
    hasAttemptedSend,
  } = useSendPayment(sendPaymentMutation, paymentDetail, selectedFeeType)

  useEffect(() => {
    setWalletText()
    validateAmount()
  }, [usdWallet, btcWallet, fee])

  const setWalletText = () => {
    // Display-only balances — floor to whole spendable minor units (#690).
    // validateAmount() below builds its own unfloored copies for validation.
    const btcBalanceMoneyAmount = toSpendableBalance(toBtcMoneyAmount(btcWallet?.balance))
    const usdBalanceMoneyAmount = toSpendableBalance(toUsdMoneyAmount(usdWallet?.balance))

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

  const autoAddContact = useCallback(async () => {
    if (!flashUserAddress) return

    try {
      const flashUsername = flashUserAddress.split("@")[0]
      const queryResult = await npubByUsernameQuery({
        variables: { username: flashUsername },
      })

      const destinationNpub = queryResult.data?.npubByUsername?.npub
      if (!destinationNpub) {
        console.error("[autoAddContact] no npub found for username:", flashUsername)
        return
      }

      let signer
      try {
        signer = await getSigner()
      } catch {
        return
      }

      const hexPubkey = nip19.decode(destinationNpub).data as string
      await addToContactList(signer, hexPubkey, promptForContactList, contactsEvent)
    } catch (err) {
      console.warn("Failed to auto-add flash user to contacts", err)
    }
  }, [flashUserAddress, npubByUsernameQuery, promptForContactList, contactsEvent])

  // Start the clock on this invoice as soon as the screen shows it, not when
  // Confirm is tapped. Registering on tap would miss the user who simply sits
  // here past the 60s lifetime and taps once — their first reading would be
  // the tap itself, so no time would appear to have elapsed.
  //
  // A no-op for a bolt11 the amount screen already registered (the reading is
  // keyed by the invoice, and the first one wins); it earns its keep for the
  // freshly minted LNURL invoice, whose first sighting really is here.
  useEffect(() => {
    if (paymentDetail.paymentRequest) {
      noteInvoiceFirstSight(paymentDetail.paymentRequest, Math.floor(Date.now() / 1000))
    }
  }, [paymentDetail.paymentRequest])

  // Held invoices perish: IBEX caps Flash receive invoices at 60 seconds, so
  // an invoice minted when the user left the amount screen can easily be dead
  // by the time they confirm — or on a retry after a first failure. Sending it
  // anyway spends a round trip to come back as the generic "Something went
  // wrong", which sends the user (and support) after the wrong cause.
  //
  // Only checked when the held bolt11 is the one that will actually go out:
  // the Breez BTC wallet re-mints at send time on the LNURL/intraledger paths,
  // where a stale held invoice is irrelevant. The lifetime is read off the
  // invoice, which removes any dependence on when we *recorded* minting it,
  // and the elapsed-since-first-sight reading (registered when the destination is
  // parsed — payment-destination/lightning.ts) removes any dependence on the device
  // clock agreeing with the issuer's.
  const heldInvoiceHasExpired = useCallback(
    () =>
      willTransmitHeldInvoice({
        sendingWalletCurrency: sendingWalletDescriptor?.currency,
        paymentType: paymentDetail.paymentType,
      }) &&
      isHeldInvoiceExpired({
        paymentRequest: paymentDetail.paymentRequest,
        nowSeconds: Math.floor(Date.now() / 1000),
        decode: (paymentRequest, network) =>
          decodeInvoiceString(paymentRequest, network as NetworkLibGaloy),
      }),
    [
      paymentDetail.paymentRequest,
      paymentDetail.paymentType,
      sendingWalletDescriptor?.currency,
    ],
  )

  const handleSendPayment = useCallback(async () => {
    if (sendPayment && sendingWalletDescriptor?.currency) {
      if (heldInvoiceHasExpired()) {
        // A refusal here is the whole point of ENG-555, so it has to be
        // countable: without an event the failure just changes shape from
        // "Something went wrong" to "Confirm did nothing", and support is
        // back where it started. Logged before the copy so the event fires
        // whichever remedy the user is shown.
        logPaymentBlockedExpiredInvoice({
          paymentType: paymentDetail.paymentType,
          sendingWallet: sendingWalletDescriptor.currency,
        })
        // Only an LNURL send can honour "go back and confirm again" — the
        // details screen re-mints on every pass forward, no edit required
        // (which matters for a fixed-amount LNURL such as a flashcard reload,
        // where the amount field is disabled and there is nothing to change).
        // A payee-minted bolt11 (scanned or pasted) is fixed: going back and
        // forward returns the *same* invoice. Those users need a new invoice
        // from whoever they are paying.
        setPaymentError(
          paymentDetail.paymentType === PaymentType.Lnurl
            ? LL.SendBitcoinConfirmationScreen.heldInvoiceExpired()
            : LL.SendBitcoinDestinationScreen.expiredInvoice(),
        )
        ReactNativeHapticFeedback.trigger("notificationError", {
          ignoreAndroidSystemSettings: true,
        })
        return
      }
      console.log("Starting animation and sending payment")
      try {
        logPaymentAttempt({
          paymentType: paymentDetail.paymentType,
          sendingWallet: sendingWalletDescriptor.currency,
        })
        // A previous Failure/throw left an error on screen; this tap is the
        // retry, so clear it before the attempt runs.
        setPaymentError(undefined)
        toggleActivityIndicator(true)
        const { status, errorsMessage, ignored } = await sendPayment()
        if (ignored) {
          // A duplicate tap while the real attempt is still in flight.
          // Nothing happened; log nothing, navigate nowhere — and do NOT
          // touch the activity indicator: it is a plain boolean, not a
          // counter, so this tap's `false` would clobber the owning tap's
          // `true` and hide the spinner for the whole in-flight send. The
          // first tap turns it off when its own send resolves.
          return
        }
        toggleActivityIndicator(false)
        logPaymentResult({
          paymentType: paymentDetail.paymentType,
          paymentStatus: status,
          sendingWallet: sendingWalletDescriptor.currency,
        })

        if (status === "SUCCESS" || status === "PENDING") {
          navigation.navigate("sendBitcoinSuccess", {
            walletCurrency: sendingWalletDescriptor.currency,
            unitOfAccountAmount:
              (sendingWalletDescriptor.currency === "USD" ||
                sendingWalletDescriptor.currency === "USDT") &&
              invoiceAmount
                ? invoiceAmount
                : paymentDetail.unitOfAccountAmount,
            onSuccessAddContact: autoAddContact,
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
        toggleActivityIndicator(false)
        if (err instanceof Error) {
          getCrashlytics().recordError(err)
          setPaymentError(err.message || err.toString())
        }
      }
    } else {
      return null
    }
  }, [
    paymentType,
    sendPayment,
    sendingWalletDescriptor?.currency,
    heldInvoiceHasExpired,
    LL,
  ])

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
        selectedFeeType={selectedFeeType}
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
