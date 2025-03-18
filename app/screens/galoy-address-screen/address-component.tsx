import { Linking, Pressable, Share, View, Modal } from "react-native"
import { useState } from "react"

import { GaloyIcon } from "@app/components/atomic/galoy-icon"
import { useAppConfig } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { toastShow } from "@app/utils/toast"
import Clipboard from "@react-native-clipboard/clipboard"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { AddressQRCode } from "@app/components/zoomable-qr-code"

const addressTypes = {
  lightning: "lightning",
  pos: "pos",
  paycode: "paycode",
} as const

type AddressComponentprops = {
  address: string
  addressType: (typeof addressTypes)[keyof typeof addressTypes]
  title: string
  useGlobeIcon?: boolean
  onToggleDescription?: () => void
}

const AddressComponent: React.FC<AddressComponentprops> = ({
  address,
  addressType,
  title,
  onToggleDescription,
  useGlobeIcon,
}) => {
  const { LL } = useI18nContext()
  const {
    theme: { colors },
  } = useTheme()
  const styles = useStyles()
  const { appConfig } = useAppConfig()
  const { name: bankName } = appConfig.galoyInstance
  const trimmedUrl =
    address.includes("https://") || address.includes("http://")
      ? address.replace("https://", "")
      : address
  
  const [qrModalVisible, setQrModalVisible] = useState(false)

  const copyToClipboard = () => {
    Clipboard.setString(address)
    toastShow({
      message: (translations) => {
        switch (addressType) {
          case addressTypes.lightning:
            return translations.GaloyAddressScreen.copiedAddressToClipboard({
              bankName,
            })
          case addressTypes.pos:
            return translations.GaloyAddressScreen.copiedCashRegisterLinkToClipboard()
          case addressTypes.paycode:
            return translations.GaloyAddressScreen.copiedPaycodeToClipboard()
        }
      },
      type: "success",
      currentTranslation: LL,
    })
  }

  const openQrModal = () => {
    setQrModalVisible(true)
  }

  const closeQrModal = () => {
    setQrModalVisible(false)
  }

  return (
    <>
      <View style={styles.container}>
        <View style={styles.titleContainer}>
          <Text style={styles.addressTitle} type="p1">
            {title}
          </Text>
          <Pressable onPress={onToggleDescription} style={styles.descriptionContainer}>
            <Text style={styles.descriptionText}>{LL.GaloyAddressScreen.howToUseIt()}</Text>
            <GaloyIcon name="question" color={styles.descriptionText.color} size={20} />
          </Pressable>
        </View>
        <View style={styles.infoContainer}>
          <Text style={styles.address} bold type="p3">
            {trimmedUrl}
          </Text>
          <View style={styles.iconsContainer}>
            {useGlobeIcon && (
              <Pressable onPress={() => Linking.openURL(address)}>
                <GaloyIcon name="globe" size={20} color={colors.black} />
              </Pressable>
            )}
            <Pressable onPress={openQrModal}>
              <GaloyIcon name="qr-code" size={20} color={colors.black} />
            </Pressable>
            <Pressable onPress={copyToClipboard}>
              <GaloyIcon name="copy-paste" size={20} color={colors.black} />
            </Pressable>
            <Pressable
              onPress={() => {
                Share.share({
                  url: address,
                  message: address,
                })
              }}
            >
              <GaloyIcon name="share" size={20} color={colors.black} />
            </Pressable>
          </View>
        </View>
      </View>
      
      <Modal
        animationType="fade"
        transparent={true}
        visible={qrModalVisible}
        onRequestClose={closeQrModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Pressable style={styles.closeButton} onPress={closeQrModal}>
                <GaloyIcon name="close" size={24} color={colors.black} />
              </Pressable>
            </View>
            <AddressQRCode address={address} size={250} />
            <Text style={styles.modalAddress}>{trimmedUrl}</Text>
            <View style={styles.modalActions}>
              {useGlobeIcon && (
                <Pressable onPress={() => Linking.openURL(address)} style={styles.modalAction}>
                  <GaloyIcon name="globe" size={24} color={colors.black} />
                  <Text style={styles.modalActionText}>Open</Text>
                </Pressable>
              )}
              <Pressable onPress={copyToClipboard} style={styles.modalAction}>
                <GaloyIcon name="copy-paste" size={24} color={colors.black} />
                <Text style={styles.modalActionText}>Copy</Text>
              </Pressable>
              <Pressable 
                onPress={() => {
                  Share.share({
                    url: address,
                    message: address,
                  })
                }}
                style={styles.modalAction}
              >
                <GaloyIcon name="share" size={24} color={colors.black} />
                <Text style={styles.modalActionText}>Share</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

export default AddressComponent

const useStyles = makeStyles(({ colors }) => ({
  container: {
    display: "flex",
    flexDirection: "column",
    rowGap: 20,
    width: "100%",
  },
  titleContainer: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  addressTitle: {
    fontSize: 16,
    lineHeight: 24,
    flexShrink: 1,
  },
  infoContainer: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    backgroundColor: colors.grey5,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 8,
    columnGap: 20,
  },
  address: {
    color: colors.black,
    fontSize: 14,
    lineHeight: 24,
  },
  descriptionContainer: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    columnGap: 5,
  },
  descriptionText: {
    color: colors.primary,
    textDecorationLine: "underline",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  iconsContainer: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    columnGap: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: '90%',
    maxWidth: 350,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.black,
  },
  closeButton: {
    padding: 5,
  },
  modalAddress: {
    marginVertical: 20,
    fontSize: 14,
    color: colors.black,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
  },
  modalAction: {
    alignItems: 'center',
    padding: 10,
  },
  modalActionText: {
    marginTop: 5,
    fontSize: 12,
    color: colors.black,
  },
}))
