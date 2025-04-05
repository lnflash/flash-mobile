import React, { useCallback, useRef } from "react"
import { Dimensions, View } from "react-native"
import { useIsFocused } from "@react-navigation/native"
import { makeStyles } from "@rneui/themed"
import {
  Camera,
  CameraDevice,
  CameraRuntimeError,
  useCodeScanner,
} from "react-native-vision-camera"

const { width, height } = Dimensions.get("window")

type Props = {
  device: CameraDevice
  processInvoice: (data?: string) => void
}

const QRCamera: React.FC<Props> = ({ device, processInvoice }) => {
  const styles = useStyles()
  const isFocused = useIsFocused()

  // Track recently scanned codes to prevent duplicates
  const recentScans = useRef<Map<string, number>>(new Map())
  const DEBOUNCE_TIMEOUT = 3000 // 3 seconds between duplicate scans

  // Check if code was recently scanned to prevent duplicates
  const isRecentScan = (code: string): boolean => {
    const now = Date.now()

    // Clean up old entries first
    for (const [key, timestamp] of recentScans.current.entries()) {
      if (now - timestamp > DEBOUNCE_TIMEOUT) {
        recentScans.current.delete(key)
      }
    }

    // Check if this code was recently scanned
    if (recentScans.current.has(code)) {
      console.log("Preventing duplicate QR code scan")
      return true
    }

    // Add to recent scans
    recentScans.current.set(code, now)
    return false
  }

  const codeScanner = useCodeScanner({
    codeTypes: ["qr", "ean-13"],
    onCodeScanned: (codes) => {
      // Process only unique codes that haven't been scanned recently
      const uniqueCodes = codes.filter((code) => code.value && !isRecentScan(code.value))

      if (uniqueCodes.length > 0) {
        console.log(`Processing ${uniqueCodes.length} new QR codes`)
        uniqueCodes.forEach((code) => processInvoice(code.value))
      }
    },
  })

  const onError = useCallback((error: CameraRuntimeError) => {
    console.error(error)
  }, [])

  return (
    <View style={styles.container}>
      <Camera
        style={styles.camera}
        device={device}
        isActive={isFocused}
        onError={onError}
        codeScanner={codeScanner}
        enableZoomGesture
      />
    </View>
  )
}

const useStyles = makeStyles(() => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  camera: {
    width: width,
    height: height,
  },
}))

export default QRCamera
