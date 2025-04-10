import React, { useCallback } from "react"
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

  const codeScanner = useCodeScanner({
    codeTypes: ["qr", "ean-13"],
    onCodeScanned: (codes) => {
      codes.forEach((code) => processInvoice(code.value))
      console.log(`Scanned ${codes.length} codes!`)
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
