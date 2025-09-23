import React, { useCallback, useEffect, useMemo, useReducer, useState } from "react"
import { View } from "react-native"
import { makeStyles } from "@rneui/themed"
import { useI18nContext } from "@app/i18n/i18n-react"
import { StackScreenProps } from "@react-navigation/stack"

// componenets
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { DestinationField } from "@app/components/send-flow"
import { ConfirmDestinationModal } from "./confirm-destination-modal"
import { DestinationInformation } from "./destination-information"

// hooks
import {
  useAccountDefaultWalletLazyQuery,
  useLnUsdInvoiceAmountMutation,
  useNpubByUsernameLazyQuery,
  useRealtimePriceQuery,
  useSendBitcoinDestinationQuery,
} from "@app/graphql/generated"
import { useActivityIndicator, useAppConfig } from "@app/hooks"
import { useIsAuthed } from "@app/graphql/is-authed-context"

// types
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { PaymentType } from "@galoymoney/client"
import {
  DestinationDirection,
  InvalidDestinationReason,
} from "./payment-destination/index.types"

// utils
import { LNURL_DOMAINS } from "@app/config"
import { toUsdMoneyAmount } from "@app/types/amounts"
import { parseDestination } from "./payment-destination"
import { logParseDestinationResult } from "@app/utils/analytics"

// store
import {
  DestinationState,
  SendBitcoinActions,
  sendBitcoinDestinationReducer,
  SendBitcoinDestinationState,
} from "./send-bitcoin-reducer"
import { useChatContext } from "../nip17-chat/chatContext"
import { nip19 } from "nostr-tools"

export const defaultDestinationState: SendBitcoinDestinationState = {
  unparsedDestination: "",
  destinationState: DestinationState.Entering,
}

type Props = StackScreenProps<RootStackParamList, "sendBitcoinDestination">

const SendBitcoinDestinationScreen: React.FC<Props> = ({ navigation, route }) => {
  const { LL } = useI18nContext()
  const isAuthed = useIsAuthed()
  const styles = usestyles()
  const { appConfig } = useAppConfig()
  const { toggleActivityIndicator } = useActivityIndicator()
  const { lnAddressHostname: lnDomain } = appConfig.galoyInstance

  const [destinationState, dispatchDestinationStateAction] = useReducer(
    sendBitcoinDestinationReducer,
    defaultDestinationState,
  )
  const [goToNextScreenWhenValid, setGoToNextScreenWhenValid] = useState(false)
  const [flashUserAddress, setFlashUserAddress] = useState<string>()

  const [lnUsdInvoiceAmount] = useLnUsdInvoiceAmountMutation()
  const [accountDefaultWalletQuery] = useAccountDefaultWalletLazyQuery({
    fetchPolicy: "no-cache",
  })
  const [npubByUsernameQuery] = useNpubByUsernameLazyQuery()
  const { getContactPubkeys } = useChatContext()

  const { data } = useSendBitcoinDestinationQuery({
    fetchPolicy: "cache-and-network",
    returnPartialData: true,
    skip: !isAuthed,
  })

  // forcing price refresh
  useRealtimePriceQuery({
    fetchPolicy: "network-only",
    skip: !isAuthed,
  })

  const wallets = data?.me?.defaultAccount.wallets
  const bitcoinNetwork = data?.globals?.network

  useEffect(() => {
    handleNavigation()
  }, [destinationState, goToNextScreenWhenValid])

  useEffect(() => {
    if (route.params?.username) {
      handleChangeText(route.params?.username)
    }
    if (route.params?.payment) {
      handleChangeText(route.params?.payment)
    }
  }, [route.params?.username, route.params?.payment])

  const handleNavigation = async () => {
    if (
      !goToNextScreenWhenValid ||
      destinationState.destinationState !== DestinationState.Valid
    ) {
      return
    } else {
      if (
        destinationState.destination.destinationDirection === DestinationDirection.Send
      ) {
        // go to send bitcoin details screen
        let invoiceAmount
        if (
          destinationState.destination.validDestination.paymentType === "lightning" &&
          wallets
        ) {
          toggleActivityIndicator(true)
          const walletId = wallets[0].id
          const paymentRequest =
            destinationState.destination.validDestination.paymentRequest

          const { data } = await lnUsdInvoiceAmount({
            variables: {
              input: {
                paymentRequest,
                walletId,
              },
            },
          })
          if (
            data?.lnUsdInvoiceFeeProbe.invoiceAmount !== null &&
            data?.lnUsdInvoiceFeeProbe.invoiceAmount !== undefined
          ) {
            invoiceAmount = toUsdMoneyAmount(data.lnUsdInvoiceFeeProbe.invoiceAmount)
          }
          toggleActivityIndicator(false)
        }
        setGoToNextScreenWhenValid(false)
        navigation.navigate("sendBitcoinDetails", {
          paymentDestination: destinationState.destination,
          flashUserAddress,
          invoiceAmount,
        })
      } else if (
        destinationState.destination.destinationDirection === DestinationDirection.Receive
      ) {
        // go to redeem bitcoin screen
        setGoToNextScreenWhenValid(false)
        navigation.navigate("redeemBitcoinDetail", {
          receiveDestination: destinationState.destination,
        })
      }
    }
  }

  const handleChangeText = useCallback(
    (newDestination: string) => {
      dispatchDestinationStateAction({
        type: "set-unparsed-destination",
        payload: { unparsedDestination: newDestination },
      })
      setGoToNextScreenWhenValid(false)
    },
    [dispatchDestinationStateAction, setGoToNextScreenWhenValid],
  )

  const validateDestination = useMemo(() => {
    if (!bitcoinNetwork || !wallets) {
      return null
    }

    return async (rawInput: string) => {
      if (destinationState.destinationState !== "entering") {
        return
      }
      dispatchDestinationStateAction({
        type: "set-validating",
        payload: {
          unparsedDestination: rawInput,
        },
      })
      const destination = await parseDestination({
        rawInput,
        myWalletIds: wallets.map((wallet) => wallet.id),
        bitcoinNetwork,
        lnurlDomains: LNURL_DOMAINS,
        accountDefaultWalletQuery,
      })

      if (destination.valid === false) {
        if (destination.invalidReason === InvalidDestinationReason.SelfPayment) {
          dispatchDestinationStateAction({
            type: SendBitcoinActions.SetUnparsedDestination,
            payload: {
              unparsedDestination: rawInput,
            },
          })
          navigation.navigate("conversionDetails")
          return
        }

        dispatchDestinationStateAction({
          type: SendBitcoinActions.SetInvalid,
          payload: {
            invalidDestination: destination,
            unparsedDestination: rawInput,
          },
        })
        return
      }

      if (
        destination.destinationDirection === DestinationDirection.Send &&
        destination.validDestination.paymentType === PaymentType.Intraledger
      ) {
        const queryResult = await npubByUsernameQuery({
          variables: { username: rawInput },
        })
        const destinationNpub = queryResult.data?.npubByUsername?.npub || ""
        logParseDestinationResult(destination)
        setFlashUserAddress(destination.validDestination.handle + "@" + lnDomain)
        let contacts = getContactPubkeys()
        if (
          destinationNpub &&
          contacts &&
          !contacts.includes(nip19.decode(destinationNpub).data as string)
        ) {
          dispatchDestinationStateAction({
            type: SendBitcoinActions.SetRequiresConfirmation,
            payload: {
              validDestination: destination,
              unparsedDestination: rawInput,
              confirmationType: {
                type: "new-username",
                username: destination.validDestination.handle,
              },
            },
          })
          return
        }
      } else {
        // 🚨 any NON-intraledger destination
        dispatchDestinationStateAction({
          type: SendBitcoinActions.SetRequiresConfirmation,
          payload: {
            validDestination: destination,
            unparsedDestination: rawInput,
            confirmationType: {
              type: "external-destination", // you can define this in your reducer/types
              address: rawInput,
            },
          },
        })
        return
      }

      dispatchDestinationStateAction({
        type: SendBitcoinActions.SetValid,
        payload: {
          validDestination: destination,
          unparsedDestination: rawInput,
        },
      })
    }
  }, [
    bitcoinNetwork,
    wallets,
    destinationState.destinationState,
    accountDefaultWalletQuery,
    dispatchDestinationStateAction,
    navigation,
  ])

  const initiateGoToNextScreen =
    validateDestination &&
    (async () => {
      validateDestination(destinationState.unparsedDestination)
      setGoToNextScreenWhenValid(true)
    })

  return (
    <Screen
      preset="scroll"
      style={styles.screenStyle}
      keyboardOffset="navigationHeader"
      keyboardShouldPersistTaps="handled"
    >
      <ConfirmDestinationModal
        destinationState={destinationState}
        dispatchDestinationStateAction={dispatchDestinationStateAction}
      />
      <View style={styles.sendBitcoinDestinationContainer}>
        <DestinationField
          validateDestination={validateDestination ? validateDestination : () => {}}
          handleChangeText={handleChangeText}
          destinationState={destinationState}
          dispatchDestinationStateAction={dispatchDestinationStateAction}
        />
        <DestinationInformation destinationState={destinationState} />
        <View style={styles.buttonContainer}>
          <PrimaryBtn
            label={
              destinationState.unparsedDestination
                ? LL.common.next()
                : LL.SendBitcoinScreen.destinationIsRequired()
            }
            loading={destinationState.destinationState === "validating"}
            disabled={
              destinationState.destinationState === "invalid" ||
              !destinationState.unparsedDestination ||
              !initiateGoToNextScreen
            }
            onPress={initiateGoToNextScreen || undefined}
          />
        </View>
      </View>
    </Screen>
  )
}

export default SendBitcoinDestinationScreen

const usestyles = makeStyles(({ colors }) => ({
  screenStyle: {
    padding: 20,
    flexGrow: 1,
  },
  sendBitcoinDestinationContainer: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
}))
