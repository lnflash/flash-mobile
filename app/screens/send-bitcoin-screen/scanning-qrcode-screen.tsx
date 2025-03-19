import React, { useEffect, useMemo, useState } from "react"
import { Alert, Linking, TouchableOpacity, View } from "react-native"
import { Text, makeStyles } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import crashlytics from "@react-native-firebase/crashlytics"
import { useCameraDevice, useCameraPermission } from "react-native-vision-camera"
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native"

// utils
import { LNURL_DOMAINS } from "@app/config"
import { parseDestination } from "./payment-destination"
import { logParseDestinationResult } from "@app/utils/analytics"

// types
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { DestinationDirection } from "./payment-destination/index.types"

// hooks
import {
  useAccountDefaultWalletLazyQuery,
  useRealtimePriceQuery,
  useScanningQrCodeScreenQuery,
} from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useI18nContext } from "@app/i18n/i18n-react"

// components
import { Screen } from "../../components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { ActionBtns, QRCamera } from "@app/components/scan"

// assets
import Close from "@app/assets/icons/close.svg"

export const ScanningQRCodeScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "scanningQRCode">>()
  const styles = useStyles()
  const device = useCameraDevice("back")
  const { LL } = useI18nContext()
  const { hasPermission, requestPermission } = useCameraPermission()

  const [pending, setPending] = useState(false)

  useRealtimePriceQuery({
    fetchPolicy: "network-only",
  })
  const [accountDefaultWalletQuery] = useAccountDefaultWalletLazyQuery({
    fetchPolicy: "no-cache",
  })
  const { data } = useScanningQrCodeScreenQuery({ skip: !useIsAuthed() })
  const wallets = data?.me?.defaultAccount.wallets
  const bitcoinNetwork = data?.globals?.network

  useEffect(() => {
    if (!hasPermission) {
      requestPermission()
    }
  }, [hasPermission, requestPermission])

  const processInvoice = useMemo(() => {
    return async (data: string | undefined) => {
      if (pending || !wallets || !bitcoinNetwork || !data) {
        return
      }
      try {
        setPending(true)

        const destination = await parseDestination({
          rawInput: data,
          myWalletIds: wallets.map((wallet) => wallet.id),
          bitcoinNetwork,
          lnurlDomains: LNURL_DOMAINS,
          accountDefaultWalletQuery,
        })
        logParseDestinationResult(destination)

        if (destination.valid) {
          if (route.params && destination.validDestination.paymentType === "onchain") {
            navigation.navigate("RefundConfirmation", {
              swapAddress: route.params.swapAddress,
              amount: route.params.amount,
              destination: destination.validDestination.address,
              fee: route.params.fee,
              feeType: route.params.feeType,
            })
          } else if (destination.destinationDirection === DestinationDirection.Send) {
            navigation.navigate("sendBitcoinDetails", {
              paymentDestination: destination,
            })
          } else {
            navigation.reset({
              routes: [
                {
                  name: "Primary",
                },
                {
                  name: "redeemBitcoinDetail",
                  params: {
                    receiveDestination: destination,
                  },
                },
              ],
            })
          }
        } else {
          Alert.alert(
            LL.ScanningQRCodeScreen.invalidTitle(),
            destination.invalidReason === "InvoiceExpired"
              ? LL.ScanningQRCodeScreen.expiredContent({
                  found: data.toString(),
                })
              : LL.ScanningQRCodeScreen.invalidContent({
                  found: data.toString(),
                }),
            [
              {
                text: LL.common.ok(),
                onPress: () => setPending(false),
              },
            ],
          )
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          crashlytics().recordError(err)
          Alert.alert(err.toString(), "", [
            {
              text: LL.common.ok(),
              onPress: () => setPending(false),
            },
          ])
        }
      }
    }
  }, [
    LL.ScanningQRCodeScreen,
    LL.common,
    navigation,
    pending,
    bitcoinNetwork,
    wallets,
    accountDefaultWalletQuery,
  ])

  if (!hasPermission) {
    const openSettings = () => {
      Linking.openSettings().catch(() => {
        Alert.alert(LL.ScanningQRCodeScreen.unableToOpenSettings())
      })
    }

    return (
      <Screen>
        <View style={styles.permissionMissing}>
          <Text type="h1" style={styles.permissionMissingText}>
            {LL.ScanningQRCodeScreen.permissionCamera()}
          </Text>
        </View>
        <PrimaryBtn
          label={LL.ScanningQRCodeScreen.openSettings()}
          onPress={openSettings}
          btnStyle={{ marginHorizontal: 20, marginBottom: 20 }}
        />
      </Screen>
    )
  } else if (device === null || device === undefined) {
    return (
      <Screen>
        <TouchableOpacity style={styles.close} onPress={navigation.goBack}>
          <Close />
        </TouchableOpacity>
        <View style={styles.permissionMissing}>
          <Text type="h1">{LL.ScanningQRCodeScreen.noCamera()}</Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen unsafe backgroundColor="#000">
      <TouchableOpacity style={styles.close} onPress={navigation.goBack}>
        <Close />
      </TouchableOpacity>
      <QRCamera device={device} processInvoice={processInvoice} />
      <ActionBtns processInvoice={processInvoice} />
    </Screen>
  )
}

const useStyles = makeStyles(() => ({
  close: {
    alignSelf: "flex-end",
    padding: 24,
  },
  permissionMissing: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  permissionMissingText: {
    width: "80%",
    textAlign: "center",
  },
}))
