import React, { useEffect, useState } from "react"
import { Pressable } from "react-native"
import styled from "styled-components/native"
import { Text, useTheme } from "@rneui/themed"
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
import Question from "@app/assets/icons/question.svg"
import Card from "@app/assets/icons/card.svg"

type Props = StackScreenProps<RootStackParamList, "getStarted">

export const GetStartedScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { saveToken } = useAppConfig()
  const { toggleActivityIndicator } = useActivityIndicator()
  const { createDeviceAccountAndLogin, appcheckTokenLoading } = useCreateAccount()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [secretMenuCounter, setSecretMenuCounter] = useState(0)

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
      navigation.replace("phoneFlow", {
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
    <Screen backgroundColor={colors.accent01}>
      <LogoWrapper>
        <Pressable onPress={onPressLogo}>
          <Text type="h05" bold>
            flash
          </Text>
        </Pressable>
      </LogoWrapper>
      <IconsWrapper>
        <Pressable onPress={onPressHelp} style={{ marginRight: 40 }}>
          <Animatable.View animation="pulse" easing="ease-out" iterationCount="infinite">
            <Question />
          </Animatable.View>
        </Pressable>
        <Pressable onPress={onPressCard}>
          <Animatable.View animation="pulse" easing="ease-out" iterationCount="infinite">
            <Card />
          </Animatable.View>
        </Pressable>
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
  align-items: center;
  justify-content: center;
  margin-top: 40px;
`

const IconsWrapper = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-bottom: 30px;
`

const BtnsWrapper = styled.View`
  margin-vertical: 30px;
  margin-horizontal: 20px;
`
