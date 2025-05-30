import React, { useCallback, useRef, useState, useEffect } from "react"
import { Dimensions, View, Text } from "react-native"
import { useIsFocused } from "@react-navigation/native"
import { makeStyles } from "@rneui/themed"
import {
  Camera,
  CameraDevice,
  CameraRuntimeError,
  useCodeScanner,
} from "react-native-vision-camera"
import { BCURQRCode, BCURDecoder } from "@app/utils/qr/bcur"

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

  // BC-UR decoder state
  const [bcurDecoder, setBcurDecoder] = useState<BCURDecoder | null>(null)
  const [decodingProgress, setDecodingProgress] = useState<{
    expectedPartCount: number
    receivedPartCount: number
    percentComplete: number
  } | null>(null)

  // Initialize BC-UR decoder
  useEffect(() => {
    const decoder = BCURQRCode.createDecoder()
    setBcurDecoder(decoder)

    return () => {
      // Cleanup
      setBcurDecoder(null)
      setDecodingProgress(null)
    }
  }, [])

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
      codes.forEach((code) => {
        if (!code.value) return

        // Check if this is a BC-UR fragment
        if (BCURQRCode.isValidFragment(code.value)) {
          if (bcurDecoder) {
            // Process BC-UR fragment
            const success = bcurDecoder.receivePart(code.value)

            if (success) {
              // Update progress
              const progress = bcurDecoder.getProgress()
              setDecodingProgress(progress)

              // Check if decoding is complete
              if (bcurDecoder.isComplete()) {
                const decodedToken = bcurDecoder.getDecodedToken()
                if (decodedToken && !isRecentScan(decodedToken)) {
                  console.log("BC-UR decoding complete, processing token")
                  processInvoice(decodedToken)

                  // Reset decoder for next scan
                  bcurDecoder.reset()
                  setDecodingProgress(null)
                }
              }
            }
          }
        } else if (!isRecentScan(code.value)) {
          // Process regular QR codes
          console.log("Processing regular QR code")
          processInvoice(code.value)
        }
      })
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
      {decodingProgress && (
        <View style={styles.progressOverlay}>
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              Scanning fragments: {decodingProgress.receivedPartCount} /{" "}
              {decodingProgress.expectedPartCount}
            </Text>
            <Text style={styles.progressPercent}>
              {decodingProgress.percentComplete}% complete
            </Text>
          </View>
        </View>
      )}
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  camera: {
    width,
    height,
  },
  progressOverlay: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  progressContainer: {
    backgroundColor: colors.black,
    opacity: 0.8,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  progressText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  progressPercent: {
    color: colors.white,
    fontSize: 14,
  },
}))

export default QRCamera
