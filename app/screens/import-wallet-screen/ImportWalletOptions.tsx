import React from "react"
import styled from "styled-components/native"
import { Icon, Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { usePersistentStateContext } from "@app/store/persistent-state"

// types
import { RootStackParamList } from "@app/navigation/stack-param-lists"

type Props = StackScreenProps<RootStackParamList, "ImportWalletOptions">

const ImportWalletOptions: React.FC<Props> = ({ navigation, route }) => {
  const insideApp = route.params?.insideApp

  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const { isAdvanceMode } = usePersistentStateContext().persistentState

  const onImportBTCWallet = () => {
    navigation.navigate("ImportWallet", {
      insideApp,
    })
  }

  const onLoginWithPhone = () => {
    navigation.navigate("phoneFlow")
  }

  const onLoginWithEmail = () => {
    navigation.navigate("emailLoginInitiate")
  }

  const onLoginWithQRCode = () => {
    navigation.navigate("SignInViaQRCode")
  }

  return (
    <Wrapper style={{ backgroundColor: colors.white }}>
      <Text type="h02" bold style={{ textAlign: "center", marginBottom: 30 }}>
        {insideApp
          ? LL.ImportWalletOptions.importOptions()
          : LL.ImportWalletOptions.loginOptions()}
      </Text>

      {isAdvanceMode && (
        <Btn onPress={onImportBTCWallet}>
          <Icon type="ionicon" size={40} name={"apps"} color={colors.icon02} />
          <BtnTextWrapper>
            <Text type="p1">{LL.ImportWalletOptions.recoveryPhrase()}</Text>
            <Text type="p3" color={colors.grey2}>
              {LL.ImportWalletOptions.importBTCWallet()}
            </Text>
          </BtnTextWrapper>
          <Icon type="ionicon" name={"chevron-forward"} size={20} />
        </Btn>
      )}
      {!insideApp && (
        <>
          <Btn onPress={onLoginWithPhone}>
            <Icon type="ionicon" name={"mail"} color={colors.icon02} size={40} />
            <BtnTextWrapper>
              <Text type="p1">{LL.ImportWalletOptions.phone()}</Text>
              <Text type="p3" color={colors.grey2}>
                {LL.ImportWalletOptions.importUsingPhone()}
              </Text>
            </BtnTextWrapper>
            <Icon type="ionicon" name={"chevron-forward"} size={20} />
          </Btn>
          <Btn onPress={onLoginWithEmail}>
            <Icon type="ionicon" name={"at"} color={colors.icon02} size={40} />
            <BtnTextWrapper>
              <Text type="p1">{LL.ImportWalletOptions.email()}</Text>
              <Text type="p3" color={colors.grey2}>
                {LL.ImportWalletOptions.importUsingEmail()}
              </Text>
            </BtnTextWrapper>
            <Icon type="ionicon" name={"chevron-forward"} size={20} />
          </Btn>
          <Btn onPress={onLoginWithQRCode}>
            <Icon type="ionicon" name={"qr-code"} color={colors.icon02} size={40} />
            <BtnTextWrapper>
              <Text type="p1">Sign In with QR code</Text>
              <Text type="p3" color={colors.grey2}>
                Import your account by scanning a QR code from your old phone.{" "}
              </Text>
            </BtnTextWrapper>
            <Icon type="ionicon" name={"chevron-forward"} size={20} />
          </Btn>
        </>
      )}
    </Wrapper>
  )
}

export default ImportWalletOptions

const Wrapper = styled.View`
  flex: 1;
  padding-horizontal: 20px;
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
  row-gap: 5px;
  margin-horizontal: 15px;
`
