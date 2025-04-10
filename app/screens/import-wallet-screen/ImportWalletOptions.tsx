import React from "react"
import styled from "styled-components/native"
import { Icon, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"

// components
import { PrimaryBtn } from "@app/components/buttons"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { usePersistentStateContext } from "@app/store/persistent-state"

// types
import { RootStackParamList } from "@app/navigation/stack-param-lists"

type Props = StackScreenProps<RootStackParamList, "ImportWalletOptions">

const ImportWalletOptions: React.FC<Props> = ({ navigation, route }) => {
  const insideApp = route.params?.insideApp
  const bottom = useSafeAreaInsets().bottom
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme

  const { persistentState } = usePersistentStateContext()
  const { btcWalletImported, isAdvanceMode } = persistentState

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

  const onPressDone = async () => {
    navigation.reset({ index: 0, routes: [{ name: "Primary" }] })
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
            <Btn onPress={onLoginWithPhone}>
              <Icon
                type="ionicon"
                name={"mail-outline"}
                color={colors.icon02}
                size={40}
              />
              <BtnTextWrapper>
                <BtnTitle style={{ color: colors.black }}>
                  {LL.ImportWalletOptions.phone()}
                </BtnTitle>
                <BtnDesc>{LL.ImportWalletOptions.importUsingPhone()}</BtnDesc>
              </BtnTextWrapper>
              <Icon type="ionicon" name={"chevron-forward"} size={20} />
            </Btn>
            <Btn onPress={onLoginWithEmail}>
              <Icon type="ionicon" name={"at-outline"} color={colors.icon02} size={40} />
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
      </Container>
      {insideApp && (
        <PrimaryBtn
          label={LL.ImportWalletOptions.done()}
          disabled={!btcWalletImported}
          btnStyle={{ marginBottom: bottom + 10 }}
          onPress={onPressDone}
        />
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
