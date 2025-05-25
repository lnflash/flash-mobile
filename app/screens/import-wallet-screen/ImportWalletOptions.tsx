import React from "react"
import styled from "styled-components/native"
import { Icon, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { usePersistentStateContext } from "@app/store/persistent-state"

// types
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// assets
import GoldWallet from "@app/assets/illustrations/gold-wallet.svg"
import Account from "@app/assets/illustrations/account.svg"
import EmailAccount from "@app/assets/illustrations/email-account.svg"

type Props = StackScreenProps<RootStackParamList, "ImportWalletOptions">

const ImportWalletOptions: React.FC<Props> = ({ navigation, route }) => {
  const insideApp = route.params?.insideApp
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme

  const { persistentState } = usePersistentStateContext()
  const { isAdvanceMode } = persistentState

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

  return (
    <Wrapper style={{ backgroundColor: colors.white }}>
      <Title style={{ color: colors.black }}>
        {insideApp
          ? LL.ImportWalletOptions.importOptions()
          : LL.ImportWalletOptions.loginOptions()}
      </Title>

      {isAdvanceMode && (
        <Btn onPress={onImportBTCWallet}>
          <GoldWallet width={60} height={60} />
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
          <Btn onPress={onLoginWithPhone}>
            <Account width={60} height={60} />
            <BtnTextWrapper>
              <BtnTitle style={{ color: colors.black }}>
                {LL.ImportWalletOptions.phone()}
              </BtnTitle>
              <BtnDesc>{LL.ImportWalletOptions.importUsingPhone()}</BtnDesc>
            </BtnTextWrapper>
            <Icon type="ionicon" name={"chevron-forward"} size={20} />
          </Btn>
          <Btn onPress={onLoginWithEmail}>
            <EmailAccount width={60} height={60} />
            <BtnTextWrapper>
              <BtnTitle style={{ color: colors.black }}>
                {LL.ImportWalletOptions.email()}
              </BtnTitle>
              <BtnDesc>{LL.ImportWalletOptions.importUsingEmail()}</BtnDesc>
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
  justify-content: space-between;
  padding-horizontal: 20px;
`

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
