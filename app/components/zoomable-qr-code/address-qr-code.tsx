import React from "react"
import { View, StyleSheet } from "react-native"
import { ZoomableQRCode } from "./zoomable-qr-code"
import { makeStyles, useTheme } from "@rneui/themed"

type AddressQRCodeProps = {
  address: string
  size?: number
}

export const AddressQRCode: React.FC<AddressQRCodeProps> = ({ address, size = 200 }) => {
  const styles = useStyles()
  
  return (
    <View style={styles.container}>
      <ZoomableQRCode
        value={address}
        size={size}
        ecl="M"
      />
    </View>
  )
}

const useStyles = makeStyles(() => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
    width: "100%",
    padding: 16,
  },
}))