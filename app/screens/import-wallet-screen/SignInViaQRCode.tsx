import React, { useEffect, useMemo, useState } from "react"
import { Alert, Linking, TouchableOpacity, View } from "react-native"
import { Icon, Text, makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { parsePhoneNumber } from "libphonenumber-js/mobile"
import { base64decode } from "byte-base64"

// hooks
import {
  ErrorType,
  RequestPhoneCodeStatus,
  useRequestPhoneCodeLogin,
} from "../phone-auth-screen/request-phone-code-login"
import { useActivityIndicator } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useCameraDevice, useCameraPermission } from "react-native-vision-camera"

// components
import { Screen } from "../../components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { ActionBtns, QRCamera } from "@app/components/scan"

// type
import { PhoneCodeChannelType } from "@app/graphql/generated"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

type Props = StackScreenProps<RootStackParamList, "SignInViaQRCode">

const SignInViaQRCode: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { toggleActivityIndicator } = useActivityIndicator()

  const [pending, setPending] = useState(false)
  const [mnemonicKey, setMnemonicKey] = useState("")
  const [nsec, setNsec] = useState("")

  const { hasPermission, requestPermission } = useCameraPermission()
  const device = useCameraDevice("back", {
    physicalDevices: ["ultra-wide-angle-camera", "wide-angle-camera", "telephoto-camera"],
  })

  const {
    submitPhoneNumber,
    phoneInputInfo,
    validatedPhoneNumber,
    status,
    setPhoneNumber,
    phoneCodeChannel,
    error,
    setCountryCode,
  } = useRequestPhoneCodeLogin()

  useEffect(() => {
    if (
      status === RequestPhoneCodeStatus.InputtingPhoneNumber &&
      phoneInputInfo?.rawPhoneNumber
    ) {
      submitPhoneNumber(PhoneCodeChannelType.Sms)
    }
  }, [status, phoneInputInfo])

  useEffect(() => {
    if (status === RequestPhoneCodeStatus.SuccessRequestingCode) {
      setPending(false)
      toggleActivityIndicator(false)
      navigation.navigate("phoneFlow", {
        screen: "phoneLoginValidate",
        params: {
          phone: validatedPhoneNumber || "",
          channel: phoneCodeChannel,
          mnemonicKey,
          nsec,
        },
      })
    } else if (status === RequestPhoneCodeStatus.Error) {
      toggleActivityIndicator(false)
      let errorMessage: string | undefined
      if (error) {
        switch (error) {
          case ErrorType.FailedCaptchaError:
            errorMessage = LL.PhoneLoginInitiateScreen.errorRequestingCaptcha()
            break
          case ErrorType.RequestCodeError:
            errorMessage = LL.PhoneLoginInitiateScreen.errorRequestingCode()
            break
          case ErrorType.TooManyAttemptsError:
            errorMessage = LL.errors.tooManyRequestsPhoneCode()
            break
          case ErrorType.InvalidPhoneNumberError:
            errorMessage = LL.PhoneLoginInitiateScreen.errorInvalidPhoneNumber()
            break
          case ErrorType.UnsupportedCountryError:
            errorMessage = LL.PhoneLoginInitiateScreen.errorUnsupportedCountry()
            break
        }
        Alert.alert(errorMessage, "", [
          {
            text: LL.common.ok(),
            onPress: () => setPending(false),
          },
        ])
      }
    }
  }, [status, error, validatedPhoneNumber, phoneCodeChannel, mnemonicKey, nsec])

  useEffect(() => {
    if (!hasPermission) {
      requestPermission()
    }
  }, [hasPermission, requestPermission])

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity style={styles.close} onPress={navigation.goBack}>
          <Icon name={"arrow-back"} size={40} color={"#fff"} type="ionicon" />
        </TouchableOpacity>
      ),
    })
  }, [navigation])

  const processQRCode = useMemo(() => {
    return async (data: string | undefined) => {
      if (pending || !data) {
        return
      }
      try {
        setPending(true)
        toggleActivityIndicator(true)

        const decodedData = base64decode(data)
        const authData = JSON.parse(decodedData)
        const parsedPhoneNumber = parsePhoneNumber(authData.phone)
        if (parsedPhoneNumber.country) {
          setCountryCode(parsedPhoneNumber.country)
          setPhoneNumber(parsedPhoneNumber.nationalNumber)
          if (authData.mnemonicKey) {
            setMnemonicKey(authData.mnemonicKey)
          }
          if (authData.nsec) {
            setNsec(authData.nsec)
          }
        } else {
          toggleActivityIndicator(false)
          Alert.alert(LL.ScanningQRCodeScreen.invalidTitle(), "", [
            {
              text: LL.common.ok(),
              onPress: () => setPending(false),
            },
          ])
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          toggleActivityIndicator(false)
          Alert.alert(err.toString(), "", [
            {
              text: LL.common.ok(),
              onPress: () => setPending(false),
            },
          ])
        }
      }
    }
  }, [pending])

  if (!hasPermission) {
    const openSettings = () => {
      Linking.openSettings().catch(() => {
        Alert.alert(LL.ScanningQRCodeScreen.unableToOpenSettings())
      })
    }

    return (
      <Screen>
        <View style={styles.permissionMissing}>
          <Text type="h1" style={styles.permissionMissingText}>
            {LL.ScanningQRCodeScreen.permissionCamera()}
          </Text>
        </View>
        <PrimaryBtn
          label={LL.ScanningQRCodeScreen.openSettings()}
          onPress={openSettings}
          btnStyle={{ marginHorizontal: 20, marginBottom: 20 }}
        />
      </Screen>
    )
  } else if (device === null || device === undefined) {
    return (
      <Screen>
        <View style={styles.permissionMissing}>
          <Text type="h1">{LL.ScanningQRCodeScreen.noCamera()}</Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen unsafe>
      {pending ? (
        <View style={{ flex: 1, backgroundColor: "#000" }} />
      ) : (
        <QRCamera device={device} processInvoice={processQRCode} />
      )}
      <ActionBtns processInvoice={processQRCode} hidePaste={true} />
    </Screen>
  )
}

export default SignInViaQRCode

const useStyles = makeStyles(() => ({
  close: {
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 15,
  },
  permissionMissing: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  permissionMissingText: {
    width: "80%",
    textAlign: "center",
  },
}))
