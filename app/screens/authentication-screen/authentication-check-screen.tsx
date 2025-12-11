import React, { useEffect } from "react"
import { Image } from "react-native"
import { makeStyles, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "../../components/screen"

// hooks
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useAuthenticationContext } from "@app/navigation/navigation-container-wrapper"
import { useAuthQuery } from "@app/graphql/generated"

// utils
import KeyStoreWrapper from "../../utils/storage/secureStorage"
import BiometricWrapper from "../../utils/biometricAuthentication"
import { AuthenticationScreenPurpose, PinScreenPurpose } from "../../utils/enum"

// assets
import AppLogoLightMode from "../../assets/logo/app-logo-light.png"
import AppLogoDarkMode from "../../assets/logo/app-logo-dark.png"

type Props = StackScreenProps<RootStackParamList, "authenticationCheck">

export const AuthenticationCheckScreen: React.FC<Props> = ({ navigation }) => {
  const { mode } = useTheme().theme
  const styles = useStyles()
  const isAuthed = useIsAuthed()

  const { setAppUnlocked } = useAuthenticationContext()

  const { data, loading } = useAuthQuery({
    skip: !isAuthed,
  })

  useEffect(() => {
    if (!loading && data) {
      handleNextScreen()
    }
  }, [isAuthed, loading, data, setAppUnlocked])

  const handleNextScreen = async () => {
    const isPinEnabled = await KeyStoreWrapper.getIsPinEnabled()

    if (
      (await BiometricWrapper.isSensorAvailable()) &&
      (await KeyStoreWrapper.getIsBiometricsEnabled())
    ) {
      navigation.replace("authentication", {
        screenPurpose: AuthenticationScreenPurpose.Authenticate,
        isPinEnabled,
      })
    } else if (isPinEnabled) {
      navigation.replace("pin", { screenPurpose: PinScreenPurpose.AuthenticatePin })
    } else if (!data?.me?.username) {
      navigation.replace("UsernameSet")
    } else {
      setAppUnlocked()
      navigation.replace("Primary")
    }
  }

  return (
    <Screen style={styles.container}>
      <Image
        source={mode === "dark" ? AppLogoDarkMode : AppLogoLightMode}
        style={styles.logo}
      />
    </Screen>
  )
}

const useStyles = makeStyles(() => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: "100%",
    resizeMode: "contain",
  },
}))
