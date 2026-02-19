import React from "react"
import { Icon, Text } from "@rneui/themed"
import styled from "styled-components/native"
import { StackScreenProps } from "@react-navigation/stack"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useTheme } from "@rneui/themed"

// components
import { PrimaryBtn } from "@app/components/buttons"

// types
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// utils
import KeyStoreWrapper from "@app/utils/storage/secureStorage"
import BiometricWrapper from "@app/utils/biometricAuthentication"
import { AuthenticationScreenPurpose, PinScreenPurpose } from "@app/utils/enum"

// graphql
import { useAccountScreenQuery } from "@app/graphql/generated"
import { useLevel } from "@app/graphql/level-context"

type Props = StackScreenProps<RootStackParamList, "BackupOptions">

const BackupOptions: React.FC<Props> = ({ navigation }) => {
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const { bottom } = useSafeAreaInsets()
  const { isAtLeastLevelZero } = useLevel()
  const { persistentState } = usePersistentStateContext()

  const { data } = useAccountScreenQuery({
    fetchPolicy: "cache-and-network",
    skip: !isAtLeastLevelZero,
  })

  const onBackupBTCWallet = async () => {
    if (!persistentState.backedUpBtcWallet) {
      navigation.navigate("BackupStart")
    } else {
      const isPinEnabled = await KeyStoreWrapper.getIsPinEnabled()
      const isSensorAvailable = await BiometricWrapper.isSensorAvailable()
      const getIsBiometricsEnabled = await KeyStoreWrapper.getIsBiometricsEnabled()

      if (isSensorAvailable && getIsBiometricsEnabled) {
        navigation.navigate("authentication", {
          screenPurpose: AuthenticationScreenPurpose.ShowSeedPhrase,
          isPinEnabled,
        })
      } else if (isPinEnabled) {
        navigation.navigate("pin", { screenPurpose: PinScreenPurpose.ShowSeedPhrase })
      } else {
        navigation.navigate("BackupShowSeedPhrase")
      }
    }
  }

  return (
    <Wrapper style={{ backgroundColor: colors.white }}>
      <Container>
        <Text type="h02" bold style={{ textAlign: "center", marginBottom: 30 }}>
          {LL.BackupOptions.title()}
        </Text>
        {persistentState.isAdvanceMode && (
          <Btn onPress={onBackupBTCWallet}>
            <Icon
              type="ionicon"
              name={
                persistentState.backedUpBtcWallet
                  ? "checkmark-circle"
                  : "checkmark-circle-outline"
              }
              color={persistentState.backedUpBtcWallet ? colors.primary : colors.icon02}
              size={40}
            />
            <BtnTextWrapper>
              <Text type="p1">
                {persistentState.backedUpBtcWallet
                  ? LL.BackupOptions.revealRecoveryPhrase()
                  : LL.BackupOptions.recoveryPhrase()}
              </Text>
              <Text type="p3" color={colors.grey2}>
                {persistentState.backedUpBtcWallet
                  ? LL.BackupOptions.revealRecoveryPhraseDesc()
                  : LL.BackupOptions.recoveryPhraseDesc()}
              </Text>
            </BtnTextWrapper>
            <Icon type="ionicon" name={"chevron-forward"} size={20} />
          </Btn>
        )}
        <Btn
          onPress={() => navigation.navigate("AccountType")}
          disabled={!!data?.me?.phone}
        >
          <Icon
            type="ionicon"
            name={!!data?.me?.phone ? "checkmark-circle" : "checkmark-circle-outline"}
            color={!!data?.me?.phone ? colors.primary : colors.icon02}
            size={40}
          />
          <BtnTextWrapper>
            <Text type="p1">{LL.BackupOptions.phone()}</Text>
            <Text type="p3" color={colors.grey2}>
              {!!data?.me?.phone
                ? LL.BackupOptions.usePhoneNumber().replace("yourNumber", data?.me?.phone)
                : LL.BackupOptions.phoneDesc()}
            </Text>
          </BtnTextWrapper>
          {!data?.me?.phone && <Icon type="ionicon" name={"chevron-forward"} size={20} />}
        </Btn>
      </Container>
      <PrimaryBtn
        label={LL.BackupOptions.done()}
        onPress={() => navigation.popToTop()}
        btnStyle={{ marginBottom: bottom || 10 }}
      />
    </Wrapper>
  )
}

export default BackupOptions

const Wrapper = styled.View`
  flex: 1;
  justify-content: space-between;
  padding-horizontal: 20px;
`

const Container = styled.View`
  flex: 1;
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
