import React, { useCallback, useEffect, useMemo, useState } from "react"
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
import { attemptFingerprintOf, frozenSendInvoice } from "./send-attempt-key"
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
  PAYMENT_RESULT_KEY_REUSED,
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
  // Whether the error on screen is one the user may act on by simply tapping
  // Confirm again.
  //
  // `paymentError` alone disables the button, which is right for a fee error or
  // a dead invoice — nothing changes by re-tapping — but wrong for the two
  // outcomes the idempotency work exists to make survivable: a definitive
  // FAILURE (nothing settled; the hook has already retired the key, so the next
  // tap is a genuinely new attempt) and a THROWN mutation (the response was
  // lost; the hook has kept the key, so the backend recognises the repeat
  // instead of paying twice). Without this both left the screen dead, and the
  // retained key could never be resent by anyone.
  const [sendIsRetryable, setSendIsRetryable] = useState(false)
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
    sendIsInFlight,
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

  // Errors raised by anything other than a send (a fee probe, the expiry
  // guard) are never fixed by tapping Confirm again, so they keep the button
  // disabled exactly as before.
  const setBlockingPaymentError = useCallback((val: string) => {
    setPaymentError(val)
    setSendIsRetryable(false)
  }, [])

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
  // Takes the invoice to judge rather than reading the detail's, because the
  // two are not always the same one: a frozen repeat transmits the bolt11 it
  // first sent, not the one this screen is holding. The caller decides which.
  //
  // Answers false outright when the held bolt11 is not what goes out at all:
  // the Breez BTC wallet re-mints at send time on the LNURL/intraledger paths,
  // where a stale held invoice is irrelevant. The lifetime is read off the
  // invoice, which removes any dependence on when we *recorded* minting it,
  // and the elapsed-since-first-sight reading (registered when the destination is
  // parsed — payment-destination/lightning.ts) removes any dependence on the device
  // clock agreeing with the issuer's.
  const invoiceHasExpired = useCallback(
    (paymentRequest?: string) =>
      willTransmitHeldInvoice({
        sendingWalletCurrency: sendingWalletDescriptor?.currency,
        paymentType: paymentDetail.paymentType,
      }) &&
      isHeldInvoiceExpired({
        paymentRequest,
        nowSeconds: Math.floor(Date.now() / 1000),
        decode: (invoice, network) =>
          decodeInvoiceString(invoice, network as NetworkLibGaloy),
      }),
    [paymentDetail.paymentType, sendingWalletDescriptor?.currency],
  )

  // The attempt this screen is confirming — the same identity useSendPayment
  // derives, so this screen can ask what a repeat of it would put on the wire.
  const fingerprint = useMemo(() => attemptFingerprintOf(paymentDetail), [paymentDetail])

  // Which remedy an expired invoice leaves this user.
  //
  // Only an LNURL send can honour "go back and confirm again" — the details
  // screen re-mints on every pass forward, no edit required (which matters for
  // a fixed-amount LNURL such as a flashcard reload, where the amount field is
  // disabled and there is nothing to change). A payee-minted bolt11 (scanned or
  // pasted) is fixed: going back and forward returns the *same* invoice. Those
  // users need a new invoice from whoever they are paying.
  const expiredInvoiceRemedy = useCallback(
    () =>
      paymentDetail.paymentType === PaymentType.Lnurl
        ? LL.SendBitcoinConfirmationScreen.heldInvoiceExpired()
        : LL.SendBitcoinDestinationScreen.expiredInvoice(),
    [paymentDetail.paymentType, LL],
  )

  const handleSendPayment = useCallback(async () => {
    if (sendPayment && sendingWalletDescriptor?.currency) {
      // The suppressed tap, recognised BEFORE anything is recorded. `sendPayment`
      // reports the same thing through `ignored`, but only once its promise
      // resolves — which is after the first send's round trip, so logging the
      // attempt above it would put two `payment_attempt` events and one
      // `payment_result` into the analytics ENG-533 is measured on, skewed by
      // precisely the double-taps ENG-533 counts. Read synchronously here, the
      // second tap in a frame leaves no trace at all.
      if (sendIsInFlight()) return

      // The bolt11 this tap will actually put on the wire, which is not always
      // the one on screen. Once an attempt is frozen (send-attempt-key.ts)
      // every repeat transmits the FROZEN input, and on the LNURL path the
      // detail in hand routinely holds a newer invoice — the details screen
      // re-mints on every pass forward. Judging the invoice this screen is
      // holding would therefore validate one invoice and send another on
      // exactly the path the freeze exists for.
      //
      // Read synchronously, and deliberately not awaited: `useSendPayment`
      // starts hydrating the persisted freezes when this screen mounts, and a
      // tap that beat that disk read would have to be awaited HERE — above the
      // `payment_attempt` log and below the in-flight guard, which is where a
      // second tap in the same frame would slip past both. A freeze this read
      // misses costs one generic error before the failure retires the key,
      // i.e. exactly today's behaviour; two counted attempts for one request
      // would corrupt the measure ENG-533 is judged by.
      const frozenInvoice = frozenSendInvoice(fingerprint)
      const transmittedInvoice = frozenInvoice ?? paymentDetail.paymentRequest
      // Read once, BEFORE the request, so the reading describes what went out
      // rather than how long the round trip took.
      const transmittingDeadInvoice = invoiceHasExpired(transmittedInvoice)

      // Refuse only when the dead invoice is a FIRST send. A frozen one is a
      // repeat of a payment the server may already have settled, and its
      // replay is how that outcome is recovered: same key, same input, so the
      // backend either returns the original result or — having never seen the
      // key — executes and answers with a definitive failure that retires the
      // key and frees the next attempt. Refusing it instead would strand the
      // attempt, because going back and forward reproduces the same
      // fingerprint and hits the same frozen invoice for the next 24h.
      if (!frozenInvoice && transmittingDeadInvoice) {
        // A refusal here is the whole point of ENG-555, so it has to be
        // countable: without an event the failure just changes shape from
        // "Something went wrong" to "Confirm did nothing", and support is
        // back where it started. Logged before the copy so the event fires
        // whichever remedy the user is shown.
        logPaymentBlockedExpiredInvoice({
          paymentType: paymentDetail.paymentType,
          sendingWallet: sendingWalletDescriptor.currency,
        })
        setBlockingPaymentError(expiredInvoiceRemedy())
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
        // Clear the previous attempt's error before the retry, or the message
        // from the send that just failed sits over the one now in flight.
        setPaymentError(undefined)
        setSendIsRetryable(false)
        toggleActivityIndicator(true)
        const result = await sendPayment()
        // The in-flight guard swallowed this tap: the FIRST send is still on
        // the wire and owns the spinner, the analytics event and the outcome.
        // Falling through here would stop the spinner mid-payment, record a
        // `payment_result` with an undefined status, and show a failure toast
        // and error haptic over a payment that is about to succeed.
        if (result.ignored) return
        const { status, errorsMessage } = result
        toggleActivityIndicator(false)
        logPaymentResult({
          paymentType: paymentDetail.paymentType,
          // A reuse rejection arrives as `{ status: "failed" }`, but it is the
          // one outcome that proves the idempotency work FIRED — the server is
          // telling us it already holds a result for this attempt, which in the
          // dangerous case is a success whose response was lost. Counted as a
          // FAILURE it would read as this feature making ENG-533's own
          // attempt→result ratio worse, exactly where that ratio is measured.
          paymentStatus: result.keyReused ? PAYMENT_RESULT_KEY_REUSED : status,
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
        } else if (result.keyReused) {
          // The backend holds an outcome for this attempt already and will not
          // replay it, because our parameters no longer match the ones it
          // cached. It arrives as `{ status: "failed" }`, so the branch below
          // would call this a definitive failure, free the button, and let the
          // next tap pay a SECOND time under a fresh key.
          //
          // `setBlockingPaymentError` is the point: nothing the user can do on
          // this screen resolves it, and their money may already have moved.
          setBlockingPaymentError(LL.SendBitcoinConfirmationScreen.keyAlreadyUsed())
          ReactNativeHapticFeedback.trigger("notificationError", {
            ignoreAndroidSystemSettings: true,
          })
        } else if (transmittingDeadInvoice) {
          // The only way to reach here: the frozen replay above went out
          // carrying an invoice that had already died, and the server rejected
          // it. Naming the cause is the whole of ENG-555 — "Something went
          // wrong" is precisely the message that sent the user, and support,
          // after the wrong cause. The failure retired the key and dropped the
          // freeze, so the remedy this copy names now actually works: the next
          // pass forward mints a live invoice and freezes THAT.
          setBlockingPaymentError(expiredInvoiceRemedy())
          ReactNativeHapticFeedback.trigger("notificationError", {
            ignoreAndroidSystemSettings: true,
          })
        } else {
          setPaymentError(errorsMessage || "Something went wrong")
          // A definitive FAILURE settled nothing, and the hook has retired the
          // key, so tapping again is a fresh attempt rather than a replay.
          setSendIsRetryable(true)
          ReactNativeHapticFeedback.trigger("notificationError", {
            ignoreAndroidSystemSettings: true,
          })
        }
      } catch (err) {
        // The response was lost. The payment may well have settled, which is
        // exactly why the hook keeps the key: the repeat carries the same one
        // and the backend returns the original outcome. Leaving the button dead
        // here is what made the whole idempotency design unreachable.
        toggleActivityIndicator(false)
        if (err instanceof Error) {
          getCrashlytics().recordError(err)
          setPaymentError(err.message || err.toString())
        } else {
          setPaymentError("Something went wrong")
        }
        setSendIsRetryable(true)
        ReactNativeHapticFeedback.trigger("notificationError", {
          ignoreAndroidSystemSettings: true,
        })
      }
    } else {
      return null
    }
  }, [
    paymentType,
    sendPayment,
    sendIsInFlight,
    sendingWalletDescriptor?.currency,
    fingerprint,
    invoiceHasExpired,
    expiredInvoiceRemedy,
    setBlockingPaymentError,
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
        setPaymentError={setBlockingPaymentError}
      />
      <ConfirmationError
        paymentError={paymentError}
        invalidAmountErrorMessage={invalidAmountErr}
      />
      <View style={styles.buttonContainer}>
        <PrimaryBtn
          loading={sendPaymentLoading}
          label={LL.SendBitcoinConfirmationScreen.title()}
          disabled={
            !isValidAmount ||
            hasAttemptedSend ||
            (Boolean(paymentError) && !sendIsRetryable)
          }
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
