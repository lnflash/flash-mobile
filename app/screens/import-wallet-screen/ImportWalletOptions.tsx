import React, { useEffect, useState } from "react"
import { StackScreenProps } from "@react-navigation/stack"
import styled from "styled-components/native"
import { Icon, useTheme } from "@rneui/themed"
import * as Keychain from "react-native-keychain"

// components
import { PrimaryBtn } from "@app/components/buttons"

// hooks
import { useAppConfig } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useFeatureFlags } from "@app/config/feature-flags-context"
import useAppCheckToken from "../get-started-screen/use-device-token"
import { usePersistentStateContext } from "@app/store/persistent-state"

// types
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// utils
import { logGetStartedAction } from "@app/utils/analytics"

const KEYCHAIN_MNEMONIC_KEY = "mnemonic_key"

type Props = StackScreenProps<RootStackParamList, "ImportWalletOptions">

const ImportWalletOptions: React.FC<Props> = ({ navigation, route }) => {
  const {
    persistentState: { btcWalletImported, isAdvanceMode },
  } = usePersistentStateContext()
  const { colors } = useTheme().theme
  const insideApp = route.params?.insideApp
  const bottom = useSafeAreaInsets().bottom
  const { LL } = useI18nContext()
  const { saveToken } = useAppConfig()
  const { deviceAccountEnabled } = useFeatureFlags()
  const [appCheckToken] = useAppCheckToken({ skip: !deviceAccountEnabled })
  const [USDWalletImported, setUSDWalletImported] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [token, setToken] = useState<string | undefined>("")

  useEffect(() => {
    if (!insideApp) {
      navigation.addListener("beforeRemove", beforeRemoveListener)
      return () => navigation.removeListener("beforeRemove", beforeRemoveListener)
    }
  }, [])

  const beforeRemoveListener = (e: any) => {
    if (e.data.action.type === "POP") {
      Keychain.resetInternetCredentials(KEYCHAIN_MNEMONIC_KEY)
    }
  }

  const onImportBTCWallet = () => {
    navigation.navigate("ImportWallet", {
      insideApp,
      onComplete: (token) => {
        setToken(token)
      },
    })
  }

  const onLoginWithPhone = () => {
    logGetStartedAction({
      action: "log_in",
      createDeviceAccountEnabled: Boolean(appCheckToken),
    })
    navigation.navigate("phoneFlow", {
      onComplete: (token) => {
        setUSDWalletImported(true)
        setPhoneVerified(true)
        setToken(token)
      },
    })
  }

  const onLoginWithEmail = () => {
    logGetStartedAction({
      action: "login_with_email",
      createDeviceAccountEnabled: Boolean(appCheckToken),
    })

    navigation.navigate("emailLoginInitiate", {
      onComplete: (token) => {
        setUSDWalletImported(true)
        setEmailVerified(true)
        setToken(token)
      },
    })
  }

  const onLogin = async () => {
    if (!insideApp) {
      if (token) {
        saveToken(token)
        navigation.reset({ index: 0, routes: [{ name: "Primary" }] })
      } else {
        alert("Login failed. Please try again")
      }
    } else {
      navigation.popToTop()
    }
  }

  return (
    <Wrapper style={{ backgroundColor: colors.white }}>
      <Container>
        <Title style={{ color: colors.black }}>
          {insideApp
            ? LL.ImportWalletOptions.importOptions()
            : LL.ImportWalletOptions.loginOptions()}
        </Title>

        {isAdvanceMode && (
          <Btn onPress={onImportBTCWallet}>
            <Icon
              type="ionicon"
              size={40}
              name={btcWalletImported ? "checkmark-circle" : "checkmark-circle-outline"}
              color={btcWalletImported ? colors.primary : colors.icon02}
            />
            <BtnTextWrapper>
              <BtnTitle style={{ color: colors.black }}>
                {LL.ImportWalletOptions.recoveryPhrase()}
              </BtnTitle>
              <BtnDesc>{LL.ImportWalletOptions.importBTCWallet()}</BtnDesc>
            </BtnTextWrapper>
            <Icon type="ionicon" name={"chevron-forward"} size={20} />
          </Btn>
        )}
        {!insideApp && (
          <>
            <Btn onPress={onLoginWithPhone} disabled={USDWalletImported}>
              <Icon
                type="ionicon"
                size={40}
                name={
                  USDWalletImported && phoneVerified
                    ? "checkmark-circle"
                    : "checkmark-circle-outline"
                }
                color={
                  USDWalletImported && phoneVerified ? colors.primary : colors.icon02
                }
              />
              <BtnTextWrapper>
                <BtnTitle style={{ color: colors.black }}>
                  {LL.ImportWalletOptions.phone()}
                </BtnTitle>
                <BtnDesc>{LL.ImportWalletOptions.importUsingPhone()}</BtnDesc>
              </BtnTextWrapper>
              {!USDWalletImported && (
                <Icon type="ionicon" name={"chevron-forward"} size={20} />
              )}
            </Btn>
            <Btn onPress={onLoginWithEmail} disabled={USDWalletImported}>
              <Icon
                type="ionicon"
                name={
                  USDWalletImported && emailVerified
                    ? "checkmark-circle"
                    : "checkmark-circle-outline"
                }
                color={
                  USDWalletImported && emailVerified ? colors.primary : colors.icon02
                }
                size={40}
              />
              <BtnTextWrapper>
                <BtnTitle style={{ color: colors.black }}>
                  {LL.ImportWalletOptions.email()}
                </BtnTitle>
                <BtnDesc>{LL.ImportWalletOptions.importUsingEmail()}</BtnDesc>
              </BtnTextWrapper>
              {!USDWalletImported && (
                <Icon type="ionicon" name={"chevron-forward"} size={20} />
              )}
            </Btn>
          </>
        )}
      </Container>
      <PrimaryBtn
        label={insideApp ? LL.ImportWalletOptions.done() : LL.ImportWalletOptions.login()}
        disabled={!btcWalletImported && !USDWalletImported}
        btnStyle={{ marginBottom: bottom + 10 }}
        onPress={onLogin}
      />
    </Wrapper>
  )
}

export default ImportWalletOptions

const Wrapper = styled.View`
  flex: 1;
  justify-content: space-between;
  padding-horizontal: 20px;
`

const Container = styled.View``

const Title = styled.Text`
  font-size: 21px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 30px;
`

const Btn = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  border-radius: 20px;
  border: 1px solid #dedede;
  margin-bottom: 20px;
  padding-vertical: 20px;
  padding-horizontal: 20px;
`

const BtnTextWrapper = styled.View`
  flex: 1;
  margin-horizontal: 15px;
`

const BtnTitle = styled.Text`
  font-size: 18px;
`

const BtnDesc = styled.Text`
  font-size: 15px;
  color: #777;
`
