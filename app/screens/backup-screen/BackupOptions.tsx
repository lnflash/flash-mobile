import React, { useState } from "react"
import { StackScreenProps } from "@react-navigation/stack"
import styled from "styled-components/native"
import { Icon } from "@rneui/themed"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useTheme } from "@rneui/themed"

// components
import { UpgradeAccountModal } from "@app/components/upgrade-account-modal"

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

  const [upgradeAccountModalVisible, setUpgradeAccountModalVisible] = useState(false)

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

  const onBackupUSDWallet = () => {
    setUpgradeAccountModalVisible(true)
  }

  return (
    <Wrapper style={{ backgroundColor: colors.white }}>
      <Container>
        <Title style={{ color: colors.black }}>{LL.BackupOptions.title()}</Title>
        {persistentState.isAdvanceMode && (
          <Btn onPress={onBackupBTCWallet}>
            <Icon
              type="ionicon"
              name={
                persistentState.backedUpBtcWallet
                  ? "checkmark-circle"
                  : "checkmark-circle-outline"
              }
              color={persistentState.backedUpBtcWallet ? "#60aa55" : "#999"}
              size={40}
            />
            <BtnTextWrapper>
              <BtnTitle style={{ color: colors.black }}>
                {persistentState.backedUpBtcWallet
                  ? LL.BackupOptions.revealRecoveryPhrase()
                  : LL.BackupOptions.recoveryPhrase()}
              </BtnTitle>
              <BtnDesc>
                {persistentState.backedUpBtcWallet
                  ? LL.BackupOptions.revealRecoveryPhraseDesc()
                  : LL.BackupOptions.recoveryPhraseDesc()}
              </BtnDesc>
            </BtnTextWrapper>
            <Icon type="ionicon" name={"chevron-forward"} size={20} />
          </Btn>
        )}
        <Btn onPress={onBackupUSDWallet} disabled={!!data?.me?.phone}>
          <Icon
            type="ionicon"
            name={!!data?.me?.phone ? "checkmark-circle" : "checkmark-circle-outline"}
            color={!!data?.me?.phone ? "#60aa55" : "#999"}
            size={40}
          />
          <BtnTextWrapper>
            <BtnTitle style={{ color: colors.black }}>
              {LL.BackupOptions.phone()}
            </BtnTitle>
            <BtnDesc>
              {!!data?.me?.phone
                ? LL.BackupOptions.usePhoneNumber().replace("yourNumber", data?.me?.phone)
                : LL.BackupOptions.phoneDesc()}
            </BtnDesc>
          </BtnTextWrapper>
          {!data?.me?.phone && <Icon type="ionicon" name={"chevron-forward"} size={20} />}
        </Btn>
      </Container>
      <MainBtn bottom={bottom} onPress={() => navigation.popToTop()}>
        <MainBtnTitle style={{ color: colors.white }}>
          {LL.BackupOptions.done()}
        </MainBtnTitle>
      </MainBtn>
      <UpgradeAccountModal
        isVisible={upgradeAccountModalVisible}
        closeModal={() => setUpgradeAccountModalVisible(false)}
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
  border-radius: 10px;
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
`
