import React, { useState } from "react"
import { Switch, View } from "react-native"
import { Text, makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import type { RootStackParamList } from "../../navigation/stack-param-lists"

// hooks
import { useApolloClient } from "@apollo/client"
import { useAppSelector } from "@app/store/redux"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useFocusEffect } from "@react-navigation/native"
import { useHideBalanceQuery } from "@app/graphql/generated"

// components
import { Screen } from "../../components/screen"
import { GaloyIcon } from "@app/components/atomic/galoy-icon"
import CustomModal from "@app/components/custom-modal/custom-modal"
import { GaloyTertiaryButton } from "@app/components/atomic/galoy-tertiary-button"

// utils
import BiometricWrapper from "../../utils/biometricAuthentication"
import KeyStoreWrapper from "../../utils/storage/secureStorage"
import { PinScreenPurpose } from "../../utils/enum"
import { toastShow } from "../../utils/toast"
import {
  saveHiddenBalanceToolTip,
  saveHideBalance,
} from "../../graphql/client-only-query"

type Props = StackScreenProps<RootStackParamList, "security">

export const SecurityScreen: React.FC<Props> = ({ route, navigation }) => {
  const { mIsBiometricsEnabled, mIsPinEnabled } = route.params
  const styles = useStyles()
  const client = useApolloClient()
  const { LL } = useI18nContext()

  const { data: { hideBalance } = {} } = useHideBalanceQuery()

  const [isBiometricsEnabled, setIsBiometricsEnabled] = useState(mIsBiometricsEnabled)
  const [isPinEnabled, setIsPinEnabled] = useState(mIsPinEnabled)
  const [isHideBalanceEnabled, setIsHideBalanceEnabled] = useState(hideBalance)
  const [backupVisible, setBackupVisible] = useState(false)

  const { userData } = useAppSelector((state) => state.user)

  useFocusEffect(() => {
    getIsBiometricsEnabled()
    getIsPinEnabled()
  })

  const getIsBiometricsEnabled = async () => {
    setIsBiometricsEnabled(await KeyStoreWrapper.getIsBiometricsEnabled())
  }

  const getIsPinEnabled = async () => {
    setIsPinEnabled(await KeyStoreWrapper.getIsPinEnabled())
  }

  const onBiometricsValueChanged = async (value: boolean) => {
    if (value) {
      try {
        if (await BiometricWrapper.isSensorAvailable()) {
          // Presents the OS specific authentication prompt
          BiometricWrapper.authenticate(
            LL.AuthenticationScreen.setUpAuthenticationDescription(),
            handleAuthenticationSuccess,
            handleAuthenticationFailure,
          )
        } else {
          toastShow({
            message: (translations) => translations.SecurityScreen.biometryNotAvailable(),
            currentTranslation: LL,
          })
        }
      } catch {
        toastShow({
          message: (translations) => translations.SecurityScreen.biometryNotEnrolled(),
          currentTranslation: LL,
        })
      }
    } else if (await KeyStoreWrapper.removeIsBiometricsEnabled()) {
      setIsBiometricsEnabled(false)
    }
  }

  const handleAuthenticationSuccess = async () => {
    if (await KeyStoreWrapper.setIsBiometricsEnabled()) {
      setIsBiometricsEnabled(true)
    }
  }

  const handleAuthenticationFailure = () => {
    // This is called when a user cancels or taps out of the authentication prompt,
    // so no action is necessary.
  }

  const onPinValueChanged = async (value: boolean) => {
    if (value) {
      navigateToPinScreen()
    } else {
      removePin()
    }
  }

  const onHideBalanceValueChanged = async (value: boolean) => {
    if (value) {
      setIsHideBalanceEnabled(await saveHideBalance(client, true))
      await saveHiddenBalanceToolTip(client, true)
    } else {
      setIsHideBalanceEnabled(await saveHideBalance(client, false))
      await saveHiddenBalanceToolTip(client, false)
    }
  }

  const removePin = async () => {
    if (await KeyStoreWrapper.removePin()) {
      KeyStoreWrapper.removePinAttempts()
      setIsPinEnabled(false)
    }
  }

  const navigateToPinScreen = () => {
    if (userData.phone || userData.email.address) {
      navigation.navigate("pin", { screenPurpose: PinScreenPurpose.SetPin })
    } else {
      setBackupVisible(true)
    }
  }

  return (
    <Screen style={styles.container} preset="scroll">
      <View style={styles.settingContainer}>
        <View style={styles.textContainer}>
          <Text type="h1">{LL.SecurityScreen.biometricTitle()}</Text>
          <Text type="p2">{LL.SecurityScreen.biometricDescription()}</Text>
        </View>
        <Switch
          style={styles.switch}
          value={isBiometricsEnabled}
          onValueChange={onBiometricsValueChanged}
        />
      </View>
      <View style={styles.settingContainer}>
        <View style={styles.textContainer}>
          <Text type="h1">{LL.SecurityScreen.pinTitle()}</Text>
          <Text type="p2">{LL.SecurityScreen.pinDescription()}</Text>
        </View>
        <Switch
          style={styles.switch}
          value={isPinEnabled}
          onValueChange={onPinValueChanged}
        />
      </View>
      <View style={styles.settingContainer}>
        <GaloyTertiaryButton
          title={LL.SecurityScreen.setPin()}
          onPress={navigateToPinScreen}
        />
      </View>
      <View style={styles.settingContainer}>
        <View style={styles.settingContainer}></View>
        <View style={styles.textContainer}>
          <Text type="h1">{LL.SecurityScreen.hideBalanceTitle()}</Text>
          <Text type="p2">{LL.SecurityScreen.hideBalanceDescription()}</Text>
        </View>
        <Switch
          style={styles.switch}
          value={isHideBalanceEnabled}
          onValueChange={onHideBalanceValueChanged}
        />
      </View>
      <CustomModal
        isVisible={backupVisible}
        toggleModal={() => setBackupVisible(!backupVisible)}
        image={<GaloyIcon name="payment-success" size={100} />}
        title={LL.UpgradeAccountModal.title()}
        body={
          <Text type="bl" style={{ textAlign: "center" }}>
            {LL.SecurityScreen.backupDescription()}
          </Text>
        }
        primaryButtonTextAbove={LL.UpgradeAccountModal.onlyAPhoneNumber()}
        primaryButtonTitle={LL.UpgradeAccountModal.letsGo()}
        primaryButtonOnPress={() => {
          navigation.navigate("phoneFlow")
          setBackupVisible(false)
        }}
        secondaryButtonTitle={LL.UpgradeAccountModal.stayInTrialMode()}
        secondaryButtonOnPress={() => setBackupVisible(false)}
      />
    </Screen>
  )
}

const useStyles = makeStyles(() => ({
  container: {
    minHeight: "100%",
    paddingLeft: 24,
    paddingRight: 24,
  },
  settingContainer: {
    flexDirection: "row",
  },
  switch: {
    bottom: 18,
    position: "absolute",
    right: 0,
  },
  textContainer: {
    marginBottom: 12,
    marginRight: 60,
    marginTop: 32,
  },
}))
