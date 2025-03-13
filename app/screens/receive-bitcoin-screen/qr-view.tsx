import React, { useMemo } from "react"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { useI18nContext } from "@app/i18n/i18n-react"
import {
  ActivityIndicator,
  useWindowDimensions,
  StyleProp,
  ViewStyle,
  Pressable,
  Animated,
  Easing,
} from "react-native"

// components
import { GaloyIcon } from "@app/components/atomic/galoy-icon"
import { SuccessIconAnimation } from "@app/components/success-animation"
import { GaloyTertiaryButton } from "@app/components/atomic/galoy-tertiary-button"

// assets
import QRCode from "react-native-qrcode-svg"
import Logo from "@app/assets/logo/blink-logo-icon.png"

// types
import { InvoiceType, GetFullUriFn } from "./payment/index.types"

type Props = {
  type: InvoiceType
  getFullUri: GetFullUriFn | string | undefined
  loading: boolean
  completed: boolean
  err: string
  style?: StyleProp<ViewStyle>
  expired: boolean
  regenerateInvoiceFn?: () => void
  copyToClipboard?: () => void | undefined
  isPayCode: boolean
  canUsePayCode: boolean
  toggleIsSetLightningAddressModalVisible: () => void
}

export const QRView: React.FC<Props> = ({
  type,
  getFullUri,
  loading,
  completed,
  err,
  style,
  expired,
  regenerateInvoiceFn,
  copyToClipboard,
  isPayCode,
  canUsePayCode,
  toggleIsSetLightningAddressModalVisible,
}) => {
  const { LL } = useI18nContext()
  const { width } = useWindowDimensions()
  const { colors } = useTheme().theme
  const styles = useStyles()

  const scaleAnim = React.useRef(new Animated.Value(1)).current
  const isPayCodeAndCanUsePayCode = isPayCode && canUsePayCode
  const isReady = (!isPayCodeAndCanUsePayCode || Boolean(getFullUri)) && !loading && !err
  const displayingQR =
    !completed && isReady && !expired && (!isPayCode || isPayCodeAndCanUsePayCode)

  const breatheIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.95,
      duration: 200,
      useNativeDriver: true,
      easing: Easing.inOut(Easing.quad),
    }).start()
  }

  const breatheOut = () => {
    if (!expired && copyToClipboard) copyToClipboard()
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
      easing: Easing.inOut(Easing.quad),
    }).start()
  }

  const renderSuccessView = useMemo(() => {
    if (completed) {
      return (
        <SuccessIconAnimation>
          <GaloyIcon name={"payment-success"} size={width / 2} />
        </SuccessIconAnimation>
      )
    }
    return null
  }, [completed])

  const renderQRCode = useMemo(() => {
    if (displayingQR && getFullUri) {
      let uri = ""
      if (typeof getFullUri === "string") {
        uri = getFullUri
      } else {
        uri = getFullUri({ uppercase: true })
      }
      return (
        <QRCode
          size={width - 72}
          value={uri}
          logoBackgroundColor="white"
          logo={Logo}
          logoSize={60}
          logoBorderRadius={10}
        />
      )
    }
    return null
  }, [displayingQR, getFullUri])

  const renderStatusView = useMemo(() => {
    if (!completed && !isReady) {
      return err !== "" ? (
        <Text type="p2" style={styles.error}>
          {err}
        </Text>
      ) : (
        <ActivityIndicator size="large" color={colors.primary} />
      )
    } else if (expired) {
      return (
        <>
          <Text type="p2" style={styles.marginBottom}>
            {LL.ReceiveScreen.invoiceHasExpired()}
          </Text>
          <GaloyTertiaryButton
            title={LL.ReceiveScreen.regenerateInvoiceButtonTitle()}
            onPress={regenerateInvoiceFn}
          />
        </>
      )
    } else if (isPayCode && !canUsePayCode) {
      return (
        <>
          <Text type="p2" style={styles.marginBottom}>
            {LL.ReceiveScreen.setUsernameToAcceptViaPaycode()}
          </Text>
          <GaloyTertiaryButton
            title={LL.ReceiveScreen.setUsernameButtonTitle()}
            onPress={toggleIsSetLightningAddressModalVisible}
          />
        </>
      )
    }
    return null
  }, [
    err,
    isReady,
    completed,
    styles,
    colors,
    expired,
    isPayCode,
    canUsePayCode,
    LL.ReceiveScreen,
    regenerateInvoiceFn,
    toggleIsSetLightningAddressModalVisible,
  ])

  return (
    <Pressable
      onPressIn={displayingQR ? breatheIn : () => {}}
      onPressOut={displayingQR ? breatheOut : () => {}}
    >
      <Animated.View
        style={[styles.container, style, { transform: [{ scale: scaleAnim }] }]}
      >
        {renderSuccessView}
        {renderQRCode}
        {renderStatusView}
      </Animated.View>
    </Pressable>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    aspectRatio: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border01,
    marginBottom: 20,
  },
  error: {
    textAlign: "center",
    color: colors.error,
    paddingHorizontal: 40,
  },
  marginBottom: {
    marginBottom: 10,
    textAlign: "center",
    paddingHorizontal: 20,
  },
}))

export default React.memo(QRView)
