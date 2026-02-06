import React, { useCallback, useEffect, useRef, useState } from "react"
import { Alert, Image, Linking, Modal, TouchableOpacity, View } from "react-native"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { Asset, launchImageLibrary } from "react-native-image-picker"
import {
  Camera,
  CameraRuntimeError,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera"

// component
import { Screen } from "../screen"
import { PrimaryBtn } from "../buttons"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"

// assets
import PhotoAdd from "@app/assets/icons/photo-add.svg"

// utils
import { toastShow } from "@app/utils/toast"

const MAX_FILE_SIZE = 5 * 1024 * 1024 // File size limit in bytes (5MB)
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/jpg", "image/heic"]

type Props = {
  label: string
  photo?: Asset
  errorMsg?: string
  isOptional?: boolean
  onPhotoUpload: (val: Asset) => void
  setErrorMsg: (val: string) => void
}

const PhotoUploadField: React.FC<Props> = ({
  label,
  photo,
  errorMsg,
  isOptional,
  onPhotoUpload,
  setErrorMsg,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { top, bottom } = useSafeAreaInsets()

  const { hasPermission, requestPermission } = useCameraPermission()
  const device = useCameraDevice("back", {
    physicalDevices: ["wide-angle-camera", "telephoto-camera"],
  })

  const camera = useRef<Camera>(null)
  const [isCameraVisible, setIsCameraVisible] = useState(false)

  useEffect(() => {
    if (!hasPermission) {
      requestPermission()
    }
  }, [hasPermission, requestPermission])

  const openSettings = () => {
    Linking.openSettings().catch(() => {
      Alert.alert(LL.ScanningQRCodeScreen.unableToOpenSettings())
    })
  }

  const onError = useCallback((error: CameraRuntimeError) => {
    console.error(error)
  }, [])

  const showImagePicker = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: "photo" })
      setIsCameraVisible(false)
      if (result.errorCode === "permission") {
        toastShow({
          message: (translations) =>
            translations.ScanningQRCodeScreen.imageLibraryPermissionsNotGranted(),
        })
      }
      if (
        result.assets &&
        result.assets.length > 0 &&
        result.assets[0].uri &&
        result.assets[0].type &&
        result.assets[0].fileSize
      ) {
        if (!ALLOWED_FILE_TYPES.includes(result.assets[0].type)) {
          setErrorMsg("Please upload a valid image (JPG, PNG, or HEIC)")
        } else if (result?.assets[0]?.fileSize > MAX_FILE_SIZE) {
          setErrorMsg("File size exceeds 5MB limit")
        } else {
          onPhotoUpload(result.assets[0])
        }
      }
    } catch (err: unknown) {
      console.log("Image Picker Error: ", err)
    }
  }

  const takePhoto = async () => {
    try {
      const file = await camera?.current?.takePhoto()
      setIsCameraVisible(false)

      if (file) {
        const result = await fetch(`file://${file?.path}`)
        const data = await result.blob()

        if (!ALLOWED_FILE_TYPES.includes(data.type)) {
          setErrorMsg("Please upload a valid image (JPG, PNG, or HEIC)")
        } else if (data.size > MAX_FILE_SIZE) {
          setErrorMsg("File size exceeds 5MB limit")
        } else {
          onPhotoUpload({
            uri: `file://${file?.path}`,
            type: data.type,
            fileSize: data.size,
            fileName: file.path.split("/").pop(),
          })
        }
      }
    } catch (err) {
      console.log("Take Photo Error", err)
    }
  }

  return (
    <View style={styles.wrapper}>
      <Text type="bl" bold>
        {label}
        {isOptional && (
          <Text type="caption" color={colors.grey2}>
            {LL.AccountUpgrade.optional()}
          </Text>
        )}
      </Text>
      <TouchableOpacity style={styles.container} onPress={() => setIsCameraVisible(true)}>
        {!!photo && <Image style={styles.img} source={{ uri: photo.uri }} />}
        <Icon name={"images"} size={40} color={colors.grey2} type="ionicon" />
      </TouchableOpacity>
      {!!errorMsg && (
        <Text type="caption" color={colors.red}>
          {errorMsg}
        </Text>
      )}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCameraVisible}
        onRequestClose={() => setIsCameraVisible(false)}
      >
        <Screen unsafe>
          <View style={[styles.row, { paddingTop: top }]}>
            <TouchableOpacity
              style={styles.close}
              onPress={() => setIsCameraVisible(false)}
            >
              <Icon name={"close"} size={40} color={"#fff"} type="ionicon" />
            </TouchableOpacity>
          </View>
          {!hasPermission ? (
            <>
              <View style={styles.center}>
                <Text type="h1" style={styles.permissionMissingText}>
                  {LL.ScanningQRCodeScreen.permissionCamera()}
                </Text>
              </View>
              <PrimaryBtn
                label={LL.ScanningQRCodeScreen.openSettings()}
                onPress={openSettings}
                btnStyle={{ marginHorizontal: 20, marginBottom: 20 }}
              />
            </>
          ) : device === null || device === undefined ? (
            <View style={styles.center}>
              <Text type="h1">{LL.ScanningQRCodeScreen.noCamera()}</Text>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <Camera
                ref={camera}
                style={styles.camera}
                device={device}
                isActive={true}
                onError={onError}
                enableZoomGesture
                photo={true}
              />
              <View style={styles.captureWrapper}>
                <TouchableOpacity style={styles.captureOutline} onPress={takePhoto}>
                  <View style={styles.capture} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          <View style={[styles.row, { paddingBottom: bottom }]}>
            <TouchableOpacity style={styles.photoLibrary} onPress={showImagePicker}>
              <PhotoAdd />
            </TouchableOpacity>
          </View>
        </Screen>
      </Modal>
    </View>
  )
}

export default PhotoUploadField

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    marginBottom: 15,
  },
  container: {
    width: "100%",
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
    marginBottom: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.grey4,
    backgroundColor: colors.grey5,
    overflow: "hidden",
  },
  img: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  row: {
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "#000",
  },
  close: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  camera: {
    flex: 1,
  },
  captureWrapper: {
    position: "absolute",
    width: "100%",
    alignItems: "center",
    bottom: 20,
  },
  captureOutline: {
    borderWidth: 3,
    borderRadius: 100,
    borderColor: "#fff",
    padding: 5,
  },
  capture: {
    width: 50,
    height: 50,
    borderRadius: 100,
    backgroundColor: "#FFF",
  },
  permissionMissingText: {
    width: "80%",
    textAlign: "center",
  },
  photoLibrary: {
    padding: 20,
  },
}))
