import React from "react"
import { Alert, TouchableOpacity, View } from "react-native"
import { makeStyles } from "@rneui/themed"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { launchImageLibrary } from "react-native-image-picker"
import Clipboard from "@react-native-clipboard/clipboard"
import { getCrashlytics } from "@react-native-firebase/crashlytics"
import RNQRGenerator from "rn-qr-generator"

// utils
import { toastShow } from "@app/utils/toast"

// assets
import Paste from "@app/assets/icons/paste.svg"
import PhotoAdd from "@app/assets/icons/photo-add.svg"

type Props = {
  processInvoice: (data?: string) => void
  hidePaste?: boolean
}

const ActionBtns: React.FC<Props> = ({ processInvoice, hidePaste }) => {
  const styles = useStyles()
  const { bottom } = useSafeAreaInsets()
  const { LL } = useI18nContext()

  const handleInvoicePaste = async () => {
    try {
      const data = await Clipboard.getString()
      processInvoice(data)
    } catch (err: unknown) {
      if (err instanceof Error) {
        getCrashlytics().recordError(err)
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
        getCrashlytics().recordError(err)
        Alert.alert(err.toString())
      }
    }
  }

  return (
    <View
      style={[
        styles.bottom,
        {
          paddingBottom: bottom,
          justifyContent: hidePaste ? "flex-end" : "space-between",
        },
      ]}
    >
      <TouchableOpacity style={styles.padding} onPress={showImagePicker}>
        <PhotoAdd />
      </TouchableOpacity>
      {!hidePaste && (
        <TouchableOpacity style={styles.padding} onPress={handleInvoicePaste}>
          <Paste />
        </TouchableOpacity>
      )}
    </View>
  )
}

const useStyles = makeStyles(() => ({
  bottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#000",
  },
  padding: {
    padding: 24,
  },
}))

export default ActionBtns
