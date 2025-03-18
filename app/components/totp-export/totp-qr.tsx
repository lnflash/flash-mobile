import { View, StyleSheet } from "react-native"
import { ZoomableQRCode } from "@app/components/zoomable-qr-code"

export const QrCodeComponent = ({ otpauth }: { otpauth: string }) => {
  return (
    <View style={styles.container}>
      <ZoomableQRCode
        value={otpauth}
        size={200}
        style={styles.qrCode}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },
  qrCode: {
    marginVertical: 16,
  }
})
