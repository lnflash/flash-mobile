import React from "react"
import { Alert, TouchableOpacity, View } from "react-native"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { launchImageLibrary } from "react-native-image-picker"
import { toastShow } from "@app/utils/toast"

type Props = {
  label: string
}

const PhotoUploadField: React.FC<Props> = ({ label }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const showImagePicker = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: "photo" })
      if (result.errorCode === "permission") {
        toastShow({
          message: (translations) =>
            translations.ScanningQRCodeScreen.imageLibraryPermissionsNotGranted(),
        })
      }
      console.log(">>>>>>>>>>>>>>", result)
    } catch (err: unknown) {
      if (err instanceof Error) {
        Alert.alert(err.toString())
      }
    }
  }

  return (
    <View>
      <Text type="bl" bold>
        {label}
      </Text>
      <TouchableOpacity style={styles.container} onPress={showImagePicker}>
        <Icon name={"images"} size={40} color={colors.grey2} type="ionicon" />
      </TouchableOpacity>
    </View>
  )
}

export default PhotoUploadField

const useStyles = makeStyles(({ colors }) => ({
  container: {
    width: "100%",
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
    marginBottom: 15,
    borderRadius: 10,
    backgroundColor: colors.grey5,
  },
}))
