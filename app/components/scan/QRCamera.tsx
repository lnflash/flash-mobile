import React, { useCallback, useEffect, useRef } from "react"
import { Animated, Dimensions, Easing, View } from "react-native"
import { useIsFocused } from "@react-navigation/native"
import { makeStyles } from "@rneui/themed"
import {
  Camera,
  CameraDevice,
  CameraRuntimeError,
  useCodeScanner,
} from "react-native-vision-camera"

const { width } = Dimensions.get("window")

type Props = {
  device: CameraDevice
  processInvoice: (data?: string) => void
}

const QRCamera: React.FC<Props> = ({ device, processInvoice }) => {
  const styles = useStyles()
  const isFocused = useIsFocused()

  const borderWidth = useRef(new Animated.Value(2)).current
  const borderColor = useRef(new Animated.Value(0)).current

  const borderColorInterpolate = borderColor.interpolate({
    inputRange: [0, 1],
    outputRange: ["#00ffba", "#ffe600"],
  })

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(borderWidth, {
          toValue: 5,
          duration: 500,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(borderWidth, {
          toValue: 2,
          duration: 500,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ]),
    ).start()

    Animated.loop(
      Animated.timing(borderColor, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: false,
      }),
    ).start()
  }, [])

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

  if (!device) return

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.cameraWrapper,
          { borderWidth, borderColor: borderColorInterpolate },
        ]}
      >
        <Camera
          style={styles.camera}
          device={device}
          isActive={isFocused}
          onError={onError}
          codeScanner={codeScanner}
        />
      </Animated.View>
    </View>
  )
}

const useStyles = makeStyles(() => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraWrapper: {
    borderRadius: 20,
    overflow: "hidden",
  },
  camera: {
    width: width - 30,
    height: width - 30,
    borderRadius: 20,
  },
}))

export default QRCamera
