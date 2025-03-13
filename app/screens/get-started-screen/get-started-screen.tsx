import React, { useEffect, useState } from "react"
import { Dimensions, Pressable, TouchableOpacity } from "react-native"
import styled from "styled-components/native"
import { useTheme } from "@rneui/themed"
import * as Animatable from "react-native-animatable"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "../../navigation/stack-param-lists"

// components
import { Screen } from "../../components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { DeviceAccountFailModal } from "./device-account-fail-modal"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useActivityIndicator, useAppConfig } from "@app/hooks"
import { useCreateAccount } from "@app/hooks/useCreateAccount"

// utils
import { logGetStartedAction } from "@app/utils/analytics"

// assets
import AppLogoLightMode from "../../assets/logo/app-logo-light.png"
import AppLogoDarkMode from "../../assets/logo/app-logo-dark.png"
import Help from "@app/assets/icons/help.png"
import Nfc from "@app/assets/icons/nfc.png"

const width = Dimensions.get("screen").width

type Props = StackScreenProps<RootStackParamList, "getStarted">

export const GetStartedScreen: React.FC<Props> = ({ navigation }) => {
  const { mode, colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { saveToken } = useAppConfig()
  const { toggleActivityIndicator } = useActivityIndicator()
  const { createDeviceAccountAndLogin, appcheckTokenLoading } = useCreateAccount()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [secretMenuCounter, setSecretMenuCounter] = useState(0)

  const AppLogo = mode === "dark" ? AppLogoDarkMode : AppLogoLightMode

  useEffect(() => {
    toggleActivityIndicator(loading || appcheckTokenLoading)
  }, [loading, appcheckTokenLoading])

  useEffect(() => {
    if (secretMenuCounter > 2) {
      setError(false)
      navigation.navigate("developerScreen")
      setSecretMenuCounter(0)
    }
  }, [navigation, secretMenuCounter])

  const handleCreateDeviceAccount = async () => {
    logGetStartedAction({
      action: "create_device_account",
      createDeviceAccountEnabled: Boolean(true),
    })
    setLoading(true)
    const token = await createDeviceAccountAndLogin()
    setLoading(false)
    if (token) {
      onCompleteLogin(token)
    } else {
      navigation.navigate("phoneFlow", {
        onComplete: onCompleteLogin,
      })
    }
  }

  const onCompleteLogin = (token?: string) => {
    if (token) {
      setError(false)
      saveToken(token)
      navigation.replace("Primary")
    } else {
      setError(true)
    }
  }

  const onRestoreWallet = () => {
    setError(false)
    navigation.navigate("ImportWalletOptions")
  }

  const navigateToHomeScreen = () => {
    setError(false)
    navigation.replace("Primary")
  }

  const onPressLogo = () => {
    setSecretMenuCounter(secretMenuCounter + 1)
  }

  const onPressHelp = () => {
    navigation.navigate("welcomeFirst")
  }

  const onPressCard = () => {}

  return (
    <Screen>
      <LogoWrapper>
        <Pressable onPress={onPressLogo}>
          <Image source={AppLogo} />
        </Pressable>
      </LogoWrapper>
      <IconsWrapper>
        <TouchableOpacity
          onPress={onPressHelp}
          style={{ padding: 20 }}
          activeOpacity={0.5}
        >
          <Icon
            source={Help}
            animation="pulse"
            easing="ease-out"
            iterationCount="infinite"
            color={colors.icon01}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onPressCard}
          style={{ padding: 20 }}
          activeOpacity={0.5}
        >
          <Icon
            source={Nfc}
            animation="pulse"
            easing="ease-out"
            iterationCount="infinite"
            size={60}
            color={colors.icon01}
          />
        </TouchableOpacity>
      </IconsWrapper>
      <BtnsWrapper>
        <PrimaryBtn
          label={LL.GetStartedScreen.quickStart()}
          onPress={handleCreateDeviceAccount}
          btnStyle={{ marginBottom: 12 }}
        />
        <PrimaryBtn
          type={"outline"}
          label={LL.GetStartedScreen.restoreWallet()}
          onPress={onRestoreWallet}
        />
      </BtnsWrapper>
      <DeviceAccountFailModal
        isVisible={error}
        closeModal={() => setError(false)}
        navigateToHomeScreen={navigateToHomeScreen}
      />
    </Screen>
  )
}

const LogoWrapper = styled.View`
  flex: 1;
  justify-content: center;
`

const Image = styled.Image`
  width: ${width}px;
  height: 250px;
  resize-mode: contain;
`

const IconsWrapper = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
`

const Icon = styled(Animatable.Image)<{ size?: number; color: string }>`
  width: ${({ size }) => size || 50}px;
  height: ${({ size }) => size || 50}px;
  tint-color: ${({ color }) => color};
`

const BtnsWrapper = styled.View`
  margin-vertical: 30px;
  margin-horizontal: 20px;
`
