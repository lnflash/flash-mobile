import React, { useState } from "react"
import { ActivityIndicator } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import styled from "styled-components/native"
import { Icon } from "@rneui/themed"

// hooks
import { useCreateAccount } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useFeatureFlags } from "@app/config/feature-flags-context"
import useAppCheckToken from "../get-started-screen/use-device-token"

// types
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// utils
import { logGetStartedAction } from "@app/utils/analytics"

type Props = StackScreenProps<RootStackParamList, "ImportWalletOptions">

const ImportWalletOptions: React.FC<Props> = ({ navigation }) => {
  const bottom = useSafeAreaInsets().bottom
  const { LL } = useI18nContext()
  const { createDeviceAccountAndLogin } = useCreateAccount()
  const { deviceAccountEnabled } = useFeatureFlags()
  const [appCheckToken] = useAppCheckToken({ skip: !deviceAccountEnabled })
  const [BTCWalletImported, setBTCWalletImported] = useState(false)
  const [USDWalletImported, setUSDWalletImported] = useState(false)
  const [loading, setLoading] = useState(false)

  const onImportBTCWallet = () => {
    navigation.navigate("ImportWallet", { onComplete: () => setBTCWalletImported(true) })
  }

  const onLoginWithPhone = () => {
    logGetStartedAction({
      action: "log_in",
      createDeviceAccountEnabled: Boolean(appCheckToken),
    })
    navigation.navigate("phoneFlow")
  }

  const onLoginWithEmail = () => {
    logGetStartedAction({
      action: "login_with_email",
      createDeviceAccountEnabled: Boolean(appCheckToken),
    })

    navigation.navigate("emailLoginInitiate")
  }

  const onLogin = async () => {
    setLoading(true)
    await createDeviceAccountAndLogin()
    setLoading(false)
    navigation.navigate("Primary")
  }

  return (
    <Wrapper>
      <Container>
        <Title>{LL.ImportWalletOptions.title()}</Title>
        <OptionWrapper>
          <Btn onPress={onImportBTCWallet} disabled={BTCWalletImported}>
            <BtnText disabled={BTCWalletImported}>
              {LL.ImportWalletOptions.importBTCWallet()}
            </BtnText>
          </Btn>
          <Icon
            type="ionicon"
            name={BTCWalletImported ? "checkbox" : "square-outline"}
            color={BTCWalletImported ? "#60aa55" : "#bbb"}
            size={30}
          />
        </OptionWrapper>
        <OptionWrapper>
          <LoginWith>
            <Text disabled={USDWalletImported}>{LL.ImportWalletOptions.loginWith()}</Text>
            <Btn onPress={onLoginWithPhone}>
              <BtnText disabled={USDWalletImported}>
                {LL.ImportWalletOptions.phone()}
              </BtnText>
            </Btn>
            <Text disabled={USDWalletImported}>{LL.ImportWalletOptions.or()}</Text>
            <Btn onPress={onLoginWithEmail}>
              <BtnText disabled={USDWalletImported}>
                {LL.ImportWalletOptions.email()}
              </BtnText>
            </Btn>
          </LoginWith>
          <Icon
            type="ionicon"
            name={USDWalletImported ? "checkbox" : "square-outline"}
            color={USDWalletImported ? "#60aa55" : "#bbb"}
            size={30}
          />
        </OptionWrapper>
      </Container>
      <MainBtn disabled={false} bottom={bottom} onPress={onLogin}>
        <MainBtnTitle>{LL.ImportWalletOptions.login()}</MainBtnTitle>
      </MainBtn>
      {loading && (
        <LoadingWrapper>
          <ActivityIndicator size={"large"} color={"#60aa55"} />
        </LoadingWrapper>
      )}
    </Wrapper>
  )
}

export default ImportWalletOptions

const Wrapper = styled.View`
  flex: 1;
  background-color: #fff;
  justify-content: space-between;
  padding-horizontal: 20px;
`

const Container = styled.View``

const Title = styled.Text`
  font-size: 25px;
  font-weight: 600;
  color: #000;
  text-align: center;
  margin-bottom: 30px;
`

const OptionWrapper = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
`

const Btn = styled.TouchableOpacity``

const BtnText = styled.Text<{ disabled: boolean }>`
  font-size: 16px;
  color: ${({ disabled }) => (disabled ? "#bbb" : "#000")};
  text-decoration: ${({ disabled }) => (disabled ? "none" : "underline")};
`

const LoginWith = styled.View`
  flex-direction: row;
`

const Text = styled.Text`
  font-size: 16px;
  color: ${({ disabled }) => (disabled ? "#bbb" : "#000")};
`

const MainBtn = styled.TouchableOpacity<{
  disabled?: boolean
  bottom: number
}>`
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background-color: ${({ disabled }) => (disabled ? "#DEDEDE" : "#60aa55")};
  margin-bottom: ${({ bottom }) => bottom || 10}px;
  padding-vertical: 14px;
`

const MainBtnTitle = styled.Text`
  font-size: 18px;
  font-weight: 600;
  color: #fff;
`
const LoadingWrapper = styled.View`
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  justify-content: center;
  align-items: center;
`
