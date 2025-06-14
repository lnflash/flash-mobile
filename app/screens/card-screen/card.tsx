import React, { useEffect, useState } from "react"
import { Alert } from "react-native"
import crashlytics from "@react-native-firebase/crashlytics"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// hooks
import {
  useAccountDefaultWalletLazyQuery,
  useScanningQrCodeScreenQuery,
} from "@app/graphql/generated"
import { useTheme } from "@rneui/themed"
import { useFlashcard } from "@app/hooks"
import { useNavigation } from "@react-navigation/native"
import { useIsAuthed } from "@app/graphql/is-authed-context"

// components
import { Screen } from "@app/components/screen"
import { EmptyCard, Flashcard } from "@app/components/card"

// utils
import {
  DestinationDirection,
  PaymentDestination,
} from "@app/screens/send-bitcoin-screen/payment-destination/index.types"
import { parseDestination } from "@app/screens/send-bitcoin-screen/payment-destination"
import { LNURL_DOMAINS } from "@app/config"

export const CardScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()
  const { colors } = useTheme().theme
  const { lnurl, resetFlashcard } = useFlashcard()

  const [reloadLnurl, setReloadLnurl] = useState<PaymentDestination>()

  const { data } = useScanningQrCodeScreenQuery({ skip: !isAuthed })
  const [accountDefaultWalletQuery] = useAccountDefaultWalletLazyQuery({
    fetchPolicy: "no-cache",
  })
  const wallets = data?.me?.defaultAccount.wallets
  const bitcoinNetwork = data?.globals?.network

  useEffect(() => {
    if (!isAuthed) {
      const unsubscribe = navigation.addListener("beforeRemove", () => {
        resetFlashcard()
      })
      return unsubscribe
    }
  }, [isAuthed, navigation])

  useEffect(() => {
    if (lnurl) parseAndSetDestination(lnurl)
  }, [lnurl])

  const parseAndSetDestination = async (lnurlMatch: string) => {
    if (!wallets || !bitcoinNetwork || !lnurlMatch) return

    try {
      const destination = await parseDestination({
        rawInput: lnurlMatch,
        myWalletIds: wallets.map((wallet) => wallet.id),
        bitcoinNetwork,
        lnurlDomains: LNURL_DOMAINS,
        accountDefaultWalletQuery,
      })
      if (destination.valid) {
        if (destination.destinationDirection === DestinationDirection.Send) {
          setReloadLnurl(destination)
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        crashlytics().recordError(err)
        Alert.alert(err.toString(), "", [
          {
            text: "Ok",
          },
        ])
      }
    }
  }

  const onReload = () => {
    if (reloadLnurl)
      navigation.navigate("sendBitcoinDetails", {
        paymentDestination: reloadLnurl,
        isFromFlashcard: true,
      })
  }

  const onTopup = () => {
    if (lnurl)
      navigation.navigate("flashcardTopup", {
        flashcardLnurl: lnurl,
      })
  }

  return (
    <Screen
      keyboardOffset="navigationHeader"
      keyboardShouldPersistTaps="handled"
      backgroundColor={colors.background}
    >
      {lnurl ? <Flashcard onReload={onReload} onTopup={onTopup} /> : <EmptyCard />}
    </Screen>
  )
}
