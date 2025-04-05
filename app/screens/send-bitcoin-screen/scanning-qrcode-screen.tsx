import React, { useEffect, useMemo, useState } from "react"
import { Alert, Linking, TouchableOpacity, View } from "react-native"
import { Icon, Text, makeStyles } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import crashlytics from "@react-native-firebase/crashlytics"
import { useCameraDevice, useCameraPermission } from "react-native-vision-camera"
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native"

// utils
import { LNURL_DOMAINS } from "@app/config"
import { parseDestination } from "./payment-destination"
import { logParseDestinationResult } from "@app/utils/analytics"
import { CashuService } from "@app/services/ecash/cashu-service"
import { usePersistentStateContext } from "@app/store/persistent-state"

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

export const ScanningQRCodeScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "scanningQRCode">>()
  const styles = useStyles()
  const device = useCameraDevice("back", {
    physicalDevices: ["ultra-wide-angle-camera", "wide-angle-camera", "telephoto-camera"],
  })

  const { LL } = useI18nContext()
  const { hasPermission, requestPermission } = useCameraPermission()
  const { persistentState } = usePersistentStateContext()

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

  useEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerRight: () => (
        <TouchableOpacity style={styles.close} onPress={navigation.goBack}>
          <Icon name={"close"} size={40} color={"#fff"} type="ionicon" />
        </TouchableOpacity>
      ),
    })
  }, [navigation])

  const processInvoice = useMemo(() => {
    return async (data: string | undefined) => {
      if (pending || !wallets || !bitcoinNetwork || !data) {
        return
      }
      try {
        setPending(true)

        // Check if this is a Cashu token and the eCash wallet is enabled
        if (persistentState.showECashWallet) {
          const cashuService = CashuService.getInstance()
          const isCashuToken = cashuService.isCashuToken(data)

          if (isCashuToken) {
            // Process the Cashu token
            const result = await cashuService.receiveToken(data)

            if (result.success) {
              // Force a balance refresh when the token is successfully redeemed
              if (!result.isPending) {
                // For direct redemption (not pending), refresh balance immediately
                await cashuService.recalculateBalances()
                await cashuService.persistState()

                // Log successful token redemption for debugging
                console.log(
                  `Successfully redeemed token with amount: ${result.amount} sats. Refreshing balance.`,
                )
              }

              // Always do an immediate wallet data refresh before navigation
              await cashuService.initializeWallet()

              // Only navigate on success
              setPending(false)
              navigation.reset({
                index: 1,
                routes: [
                  { name: "Primary" },
                  {
                    name: "ECashWallet",
                    params: {
                      // Pass a refresh flag to ensure the wallet screen refreshes data
                      forceRefresh: true,
                      refreshTimestamp: Date.now(),
                    },
                  },
                ],
              })
              return
            }

            // Determine a user-friendly error message
            let errorTitle = "Error Processing Cashu Token"
            let errorMessage = result.error || "Failed to process the token"

            // Check for specific error cases
            if (result.error?.includes("already been redeemed")) {
              errorTitle = "Token Already Used"
              errorMessage =
                "This token has already been redeemed and cannot be used again."
            }

            // Log the error to help with debugging
            console.log("Cashu token redemption failed:", result.error)

            // Show error message
            Alert.alert(errorTitle, errorMessage, [
              {
                text: LL.common.ok(),
                onPress: () => setPending(false),
              },
            ])
            return
          }
        }

        // If not a Cashu token or eCash wallet disabled, proceed with normal parsing
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
    persistentState.showECashWallet,
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
          btnStyle={styles.settingsButton}
        />
      </Screen>
    )
  } else if (device === null || device === undefined) {
    return (
      <Screen>
        <View style={styles.permissionMissing}>
          <Text type="h1">{LL.ScanningQRCodeScreen.noCamera()}</Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen unsafe>
      <QRCamera device={device} processInvoice={processInvoice} />
      <ActionBtns processInvoice={processInvoice} />
    </Screen>
  )
}

const useStyles = makeStyles(() => ({
  close: {
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 15,
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
  settingsButton: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
}))
