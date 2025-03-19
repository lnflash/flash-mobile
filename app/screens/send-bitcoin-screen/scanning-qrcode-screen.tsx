import * as React from "react"
import { Alert, Dimensions, Linking, Pressable, StyleSheet, View, Platform } from "react-native"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import Clipboard from "@react-native-clipboard/clipboard"
import { StackScreenProps } from "@react-navigation/stack"
import crashlytics from "@react-native-firebase/crashlytics"
import { launchImageLibrary } from "react-native-image-picker"
import Icon from "react-native-vector-icons/Ionicons"
import Svg, { Circle } from "react-native-svg"
import RNQRGenerator from "rn-qr-generator"
import { gql } from "@apollo/client"
import {
  Camera,
  CameraRuntimeError,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from "react-native-vision-camera"
import { GestureDetector, Gesture, PinchGestureHandler, State } from "react-native-gesture-handler"
import { runOnJS } from "react-native-reanimated"

// utils
import { toastShow } from "@app/utils/toast"
import { LNURL_DOMAINS } from "@app/config"
import { useIsFocused } from "@react-navigation/native"
import { parseDestination } from "./payment-destination"
import { logParseDestinationResult } from "@app/utils/analytics"
import { RootStackParamList } from "../../navigation/stack-param-lists"

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
import { DestinationDirection } from "./payment-destination/index.types"
import { GaloyPrimaryButton } from "@app/components/atomic/galoy-primary-button"

const { width: screenWidth } = Dimensions.get("window")
const { height: screenHeight } = Dimensions.get("window")

gql`
  query scanningQRCodeScreen {
    globals {
      network
    }
    me {
      id
      defaultAccount {
        id
        wallets {
          id
        }
      }
      contacts {
        id
        username
      }
    }
  }
`

type Props = StackScreenProps<RootStackParamList, "scanningQRCode">

export const ScanningQRCodeScreen: React.FC<Props> = ({ navigation, route }) => {
  // forcing price refresh
  useRealtimePriceQuery({
    fetchPolicy: "network-only",
  })

  const {
    theme: { colors },
  } = useTheme()

  const [pending, setPending] = React.useState(false)

  const { data } = useScanningQrCodeScreenQuery({ skip: !useIsAuthed() })
  const wallets = data?.me?.defaultAccount.wallets
  const bitcoinNetwork = data?.globals?.network
  const [accountDefaultWalletQuery] = useAccountDefaultWalletLazyQuery({
    fetchPolicy: "no-cache",
  })

  const { LL } = useI18nContext()
  const device = useCameraDevice("back")
  const { hasPermission, requestPermission } = useCameraPermission()

  const isFocused = useIsFocused()
  
  // Create camera ref
  const cameraRef = React.useRef<Camera>(null)
  
  // Track zoom level and scale reference
  const [zoomLevel, setZoomLevel] = React.useState(0)
  const baseScaleRef = React.useRef(1) // Reference value to track the base scale
  const lastScaleRef = React.useRef(1) // Reference to last scale value for relative changes
  const pinchStartedRef = React.useRef(false) // Track if pinch has started
  
  // Log device platform
  React.useEffect(() => {
    const platform = Platform.OS;
    console.log('Camera zoom: Running on platform:', platform);
  }, []);

  // Create pinch gesture handler
  const onPinchGestureEvent = React.useCallback((event: any) => {
    if (!pinchStartedRef.current) {
      console.log('Camera zoom: First pinch movement detected');
      pinchStartedRef.current = true;
    }
    
    console.log('Camera zoom: Raw event received:', 
                'scale:', event.nativeEvent.scale, 
                'velocity:', event.nativeEvent.velocity,
                'focal X:', event.nativeEvent.focalX,
                'focal Y:', event.nativeEvent.focalY);
    
    if (cameraRef.current) {
      try {
        // Get the scale from the pinch
        const { scale } = event.nativeEvent;
        
        // Calculate scale delta from last value
        const scaleDelta = scale - lastScaleRef.current;
        lastScaleRef.current = scale;
        
        console.log('Camera zoom: Scale delta:', scaleDelta);
        
        // Determine zoom direction from scale delta
        let newZoom = zoomLevel;
        if (Math.abs(scaleDelta) > 0.01) { // Apply threshold to avoid noise
          if (scaleDelta > 0) {
            // Pinching outward (zoom in)
            newZoom = Math.min(1, zoomLevel + 0.04);
            console.log('Camera zoom: Zooming IN', 'delta:', scaleDelta, 'new zoom:', newZoom);
          } else {
            // Pinching inward (zoom out)
            newZoom = Math.max(0, zoomLevel - 0.04);
            console.log('Camera zoom: Zooming OUT', 'delta:', scaleDelta, 'new zoom:', newZoom);
          }
        }
        
        if (newZoom !== zoomLevel) {
          setZoomLevel(newZoom);
          
          // Apply zoom to camera
          try {
            const zoomToApply = newZoom * 8;
            console.log('Camera zoom: Setting camera zoom to:', zoomToApply);
            
            // Try setting the property directly
            cameraRef.current.zoom = zoomToApply;
            
            // Verify camera zoom was set
            console.log('Camera zoom: Camera zoom after setting:', cameraRef.current.zoom);
          } catch (zoomError) {
            console.error('Camera zoom: Error setting zoom on camera:', zoomError);
          }
        }
      } catch (error) {
        console.error('Camera zoom: Error in pinch handler:', error);
      }
    } else {
      console.log('Camera zoom: Camera ref is null');
    }
  }, [zoomLevel])

  // const requestCameraPermission = React.useCallback(async () => {
  //   const permission = await Camera.requestCameraPermission()
  //   if (permission === "denied") await Linking.openSettings()
  // }, [])

  // React.useEffect(() => {
  //   if (cameraPermissionStatus !== "authorized") {
  //     requestCameraPermission()
  //   }
  // }, [cameraPermissionStatus, navigation, requestCameraPermission])
  React.useEffect(() => {
    if (!hasPermission) {
      requestPermission()
    }
  }, [hasPermission, requestPermission])

  const processInvoice = React.useMemo(() => {
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
          if (
            route.params?.swapAddress &&
            route.params.amount &&
            route.params.fee &&
            destination.validDestination.paymentType === "onchain"
          ) {
            navigation.replace("RefundConfirmation", {
              swapAddress: route.params.swapAddress,
              amount: route.params.amount,
              destination: destination.validDestination.address,
              fee: route.params.fee,
            })
          } else if (destination.destinationDirection === DestinationDirection.Send) {
            navigation.replace("sendBitcoinDetails", {
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
  const styles = useStyles()

  const codeScanner = useCodeScanner({
    codeTypes: ["qr", "ean-13"],
    onCodeScanned: (codes) => {
      codes.forEach((code) => processInvoice(code.value))
      console.log(`Scanned ${codes.length} codes!`)
    },
  })

  const handleInvoicePaste = async () => {
    try {
      const data = await Clipboard.getString()
      processInvoice(data)
    } catch (err: unknown) {
      if (err instanceof Error) {
        crashlytics().recordError(err)
        Alert.alert(err.toString())
      }
    }
  }

  const showImagePicker = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: "photo" })
      if (result.errorCode === "permission") {
        toastShow({
          message: (translations) =>
            translations.ScanningQRCodeScreen.imageLibraryPermissionsNotGranted(),
        })
      }
      if (result.assets && result.assets.length > 0 && result.assets[0].uri) {
        const qrCodeValues = await RNQRGenerator.detect({ uri: result.assets[0].uri })
        if (qrCodeValues && qrCodeValues.values.length > 0) {
          processInvoice(qrCodeValues.values[0])
        } else {
          Alert.alert(LL.ScanningQRCodeScreen.noQrCode())
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        crashlytics().recordError(err)
        Alert.alert(err.toString())
      }
    }
  }

  const onError = React.useCallback((error: CameraRuntimeError) => {
    console.error(error)
  }, [])

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
          <GaloyPrimaryButton
            title={LL.ScanningQRCodeScreen.openSettings()}
            onPress={openSettings}
          />
        </View>
      </Screen>
    )
  }

  if (device === null || device === undefined)
    return (
      <Screen>
        <View style={styles.permissionMissing}>
          <Text type="h1" style={styles.permissionMissingText}>
            {LL.ScanningQRCodeScreen.noCamera()}
          </Text>
        </View>
      </Screen>
    )

  return (
    <Screen unsafe>
      <View style={StyleSheet.absoluteFill}>
        <PinchGestureHandler
          onGestureEvent={onPinchGestureEvent}
          onHandlerStateChange={(event) => {
            console.log('Camera zoom: Gesture state changed to:', event.nativeEvent.state);
            
            // Reset zoom tracking when gesture begins/ends
            if (event.nativeEvent.state === State.BEGAN) {
              baseScaleRef.current = event.nativeEvent.scale;
              lastScaleRef.current = event.nativeEvent.scale;
              pinchStartedRef.current = false;
              console.log('Camera zoom: Pinch gesture BEGAN with scale:', baseScaleRef.current);
            } else if (event.nativeEvent.state === State.ACTIVE) {
              console.log('Camera zoom: Pinch gesture ACTIVE with scale:', event.nativeEvent.scale);
            } else if (event.nativeEvent.state === State.END) {
              console.log('Camera zoom: Pinch gesture ENDED with scale:', event.nativeEvent.scale);
              pinchStartedRef.current = false;
            } else if (event.nativeEvent.state === State.FAILED) {
              console.log('Camera zoom: Pinch gesture FAILED');
              pinchStartedRef.current = false;
            } else if (event.nativeEvent.state === State.CANCELLED) {
              console.log('Camera zoom: Pinch gesture CANCELLED');
              pinchStartedRef.current = false;
            }
          }}
        >
          <View style={StyleSheet.absoluteFill}>
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={isFocused}
              onError={onError}
              codeScanner={codeScanner}
              zoom={zoomLevel * 8}
            />
          </View>
        </PinchGestureHandler>
        <View style={styles.rectangleContainer}>
          <View style={styles.rectangle} />
        </View>
        <Pressable onPress={navigation.goBack}>
          <View style={styles.close}>
            <Svg viewBox="0 0 100 100">
              <Circle cx={50} cy={50} r={50} fill={colors._white} opacity={0.5} />
            </Svg>
            <Icon name="close" size={64} style={styles.iconClose} />
          </View>
        </Pressable>
        <View style={styles.openGallery}>
          <Pressable onPress={showImagePicker}>
            <Icon
              name="image"
              size={64}
              color={colors._lightGrey}
              style={styles.iconGalery}
            />
          </Pressable>
          <Pressable onPress={handleInvoicePaste}>
            {/* we could Paste from "FontAwesome" but as svg*/}
            <Icon
              name="clipboard-outline"
              size={64}
              color={colors._lightGrey}
              style={styles.iconClipboard}
            />
          </Pressable>
        </View>
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  close: {
    alignSelf: "flex-end",
    height: 64,
    marginRight: 16,
    marginTop: 40,
    width: 64,
  },

  openGallery: {
    height: 128,
    left: 32,
    position: "absolute",
    top: screenHeight - 96,
    width: screenWidth,
  },

  rectangle: {
    borderColor: colors.primary,
    borderWidth: 2,
    height: screenWidth * 0.65,
    width: screenWidth * 0.65,
  },

  rectangleContainer: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },

  noPermissionsView: {
    ...StyleSheet.absoluteFillObject,
  },

  iconClose: { position: "absolute", top: -2, color: colors._black },

  iconGalery: { opacity: 0.8 },

  iconClipboard: { opacity: 0.8, position: "absolute", bottom: "5%", right: "15%" },

  permissionMissing: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    rowGap: 32,
  },

  permissionMissingText: {
    width: "80%",
    textAlign: "center",
  },
}))
