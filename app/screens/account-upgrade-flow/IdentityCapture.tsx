import React, { useCallback, useEffect, useRef, useState } from "react"
import { Alert, LayoutChangeEvent, Linking, TouchableOpacity, View } from "react-native"
import { Icon, makeStyles, Text } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  Camera,
  CameraRuntimeError,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { CaptureOverlay, CapturePreview } from "@app/components/account-upgrade-flow"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"

// store
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import {
  CapturedImage,
  IdentitySide,
  setIdentityCapture,
} from "@app/store/redux/slices/accountUpgradeSlice"

// utils
import { captureGate, nextSide } from "@app/utils/identity-verification"
import { testProps } from "@app/utils/testProps"

type Props = StackScreenProps<RootStackParamList, "IdentityCapture">

/**
 * ENG-608 step 2: one screen per side (front / back / selfie). Overlay guide,
 * still capture, a resolution/aspect gate, then a preview with Retake / Use
 * photo. Nothing leaves the device here — uploads happen on IdentityReview.
 */
const IdentityCapture: React.FC<Props> = ({ navigation, route }) => {
  const { side, resubmit = false, returnToReview = false } = route.params
  const dispatch = useAppDispatch()
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { top, bottom } = useSafeAreaInsets()
  const { documentType } = useAppSelector((state) => state.accountUpgrade.identity)

  const { hasPermission, requestPermission } = useCameraPermission()
  const device = useCameraDevice(side === "selfie" ? "front" : "back")
  const camera = useRef<Camera>(null)

  const [captured, setCaptured] = useState<CapturedImage>()
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string>()
  const [permissionAsked, setPermissionAsked] = useState(false)
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!hasPermission && !permissionAsked) {
      setPermissionAsked(true)
      requestPermission().catch(() => undefined)
    }
  }, [hasPermission, permissionAsked, requestPermission])

  const copy: Record<IdentitySide, { title: string; hint: string }> = {
    front: {
      title: LL.AccountUpgrade.captureFrontTitle(),
      hint: LL.AccountUpgrade.captureFrontHint(),
    },
    back: {
      title: LL.AccountUpgrade.captureBackTitle(),
      hint: LL.AccountUpgrade.captureBackHint(),
    },
    selfie: {
      title: LL.AccountUpgrade.captureSelfieTitle(),
      hint: LL.AccountUpgrade.captureSelfieHint(),
    },
  }

  const openSettings = () => {
    Linking.openSettings().catch(() => {
      Alert.alert(LL.ScanningQRCodeScreen.unableToOpenSettings())
    })
  }

  const onCameraError = useCallback((error: CameraRuntimeError) => {
    // Never log the payload: it can carry the file path of a captured ID.
    console.error("IdentityCapture camera error:", error.code)
  }, [])

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setViewSize({ width, height })
  }

  const takePhoto = async () => {
    if (busy || !camera.current) return
    setBusy(true)
    setErrorMsg(undefined)
    try {
      const file = await camera.current.takePhoto({ enableShutterSound: false })
      const gate = captureGate({ width: file.width, height: file.height })
      if (!gate.ok) {
        setErrorMsg(
          gate.reason === "small"
            ? LL.AccountUpgrade.captureTooSmall()
            : LL.AccountUpgrade.captureBadShape(),
        )
        return
      }
      setCaptured({
        uri: `file://${file.path}`,
        width: file.width,
        height: file.height,
        fileName: `${side}-${Date.now()}.jpg`,
        type: "image/jpeg",
      })
    } catch {
      setErrorMsg(LL.AccountUpgrade.captureFailed())
    } finally {
      setBusy(false)
    }
  }

  const onAccept = () => {
    if (!captured) return
    dispatch(setIdentityCapture({ side, image: captured }))
    const next = nextSide(side, documentType)
    if (returnToReview || !next) {
      navigation.navigate("IdentityReview", { resubmit })
    } else {
      navigation.push("IdentityCapture", { side: next, resubmit })
    }
  }

  if (captured) {
    return (
      <Screen unsafe backgroundColor="#000">
        <CapturePreview
          image={captured}
          title={copy[side].title}
          onRetake={() => setCaptured(undefined)}
          onAccept={onAccept}
        />
      </Screen>
    )
  }

  return (
    <Screen unsafe backgroundColor="#000">
      <View style={[styles.header, { paddingTop: top + 8 }]}>
        <Text type="h1" bold style={styles.headerText}>
          {copy[side].title}
        </Text>
        <Text type="bm" style={styles.hintText}>
          {copy[side].hint}
        </Text>
      </View>
      {!hasPermission ? (
        <View style={styles.center} {...testProps("capture-permission-denied")}>
          <Icon name="camera-outline" size={56} color="#fff" type="ionicon" />
          <Text type="h1" bold style={styles.permissionTitle}>
            {LL.AccountUpgrade.cameraPermissionTitle()}
          </Text>
          <Text type="bm" style={styles.permissionDesc}>
            {LL.AccountUpgrade.cameraPermissionDesc()}
          </Text>
          <PrimaryBtn
            label={LL.AccountUpgrade.openSettings()}
            onPress={openSettings}
            btnStyle={styles.permissionBtn}
          />
        </View>
      ) : !device ? (
        <View style={styles.center}>
          <Text type="h1" style={styles.permissionTitle}>
            {LL.ScanningQRCodeScreen.noCamera()}
          </Text>
        </View>
      ) : (
        <View style={styles.cameraWrapper} onLayout={onLayout}>
          <Camera
            ref={camera}
            style={styles.camera}
            device={device}
            isActive={true}
            photo={true}
            photoQualityBalance="quality"
            onError={onCameraError}
          />
          <CaptureOverlay side={side} width={viewSize.width} height={viewSize.height} />
        </View>
      )}
      <View style={[styles.footer, { paddingBottom: bottom + 16 }]}>
        {!!errorMsg && (
          <Text type="bm" style={styles.error} {...testProps("capture-error")}>
            {errorMsg}
          </Text>
        )}
        {hasPermission && !!device && (
          <TouchableOpacity
            style={[styles.captureOutline, busy && styles.captureBusy]}
            onPress={takePhoto}
            disabled={busy}
            {...testProps("capture-shutter")}
          >
            <View style={styles.capture} />
          </TouchableOpacity>
        )}
      </View>
    </Screen>
  )
}

export default IdentityCapture

const useStyles = makeStyles(({ colors }) => ({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#000",
  },
  headerText: {
    color: "#fff",
  },
  hintText: {
    color: colors.grey3,
    marginTop: 4,
  },
  cameraWrapper: {
    flex: 1,
    overflow: "hidden",
  },
  camera: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  permissionTitle: {
    color: "#fff",
    textAlign: "center",
    marginTop: 16,
  },
  permissionDesc: {
    color: colors.grey3,
    textAlign: "center",
    marginTop: 8,
  },
  permissionBtn: {
    marginTop: 24,
    alignSelf: "stretch",
  },
  footer: {
    alignItems: "center",
    paddingTop: 12,
    backgroundColor: "#000",
  },
  error: {
    color: colors._orange,
    textAlign: "center",
    marginHorizontal: 20,
    marginBottom: 12,
  },
  captureOutline: {
    borderWidth: 3,
    borderRadius: 100,
    borderColor: "#fff",
    padding: 5,
  },
  captureBusy: {
    opacity: 0.5,
  },
  capture: {
    width: 56,
    height: 56,
    borderRadius: 100,
    backgroundColor: "#fff",
  },
}))
