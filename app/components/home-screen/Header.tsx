import React, { useEffect } from "react"
import { StyleSheet } from "react-native"
import { Icon, useTheme } from "@rneui/themed"
import styled from "styled-components/native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackNavigationProp } from "@react-navigation/stack"
import { AuthorizationStatus } from "@react-native-firebase/messaging"

// hooks
import { useIsFocused, useNavigation } from "@react-navigation/native"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useApolloClient } from "@apollo/client"
import { useHideBalanceQuery } from "@app/graphql/generated"
import { useFeatureFlags } from "@app/config/feature-flags-context"
import { useI18nContext } from "@app/i18n/i18n-react"

// utils
import { addDeviceToken, requestNotificationPermission } from "@app/utils/notifications"
import { saveHideBalance } from "@app/graphql/client-only-query"

// assets
import Chart from "@app/assets/icons/chart.svg"
import Menu from "@app/assets/icons/setting.svg"
import AskFlash from "@app/assets/icons-redesign/ask-flash.svg"

type Props = {
  /** Opens the home screen's account-create sheet, for a signed-out user. */
  setModalVisible: (val: boolean) => void
}

const Header: React.FC<Props> = ({ setModalVisible }) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()
  const isFocused = useIsFocused()
  const client = useApolloClient()
  const { LL } = useI18nContext()
  const { assistantEnabled } = useFeatureFlags()

  const { colors, mode } = useTheme().theme

  const { data: { hideBalance = false } = {} } = useHideBalanceQuery()

  // notification permission
  useEffect(() => {
    let timeout: NodeJS.Timeout
    if (isAuthed && isFocused && client) {
      timeout = setTimeout(
        async () => {
          const result = await requestNotificationPermission()
          if (
            result === AuthorizationStatus.PROVISIONAL ||
            result === AuthorizationStatus.AUTHORIZED
          ) {
            await addDeviceToken(client)
          }
        }, // no op if already requested
        5000,
      )
    }
    return () => timeout && clearTimeout(timeout)
  }, [isAuthed, isFocused, client])

  // The buttons are handed to the navigator here and keep the values they
  // were made with until this runs again, so every value they read that can
  // change is listed. The assistant flag can turn on after the first render
  // (Remote Config, the dev link): unlisted, Ask Flash would stay hidden
  // until something else here changed.
  useEffect(() => {
    navigation.setOptions({
      headerLeft: renderHeaderLeft,
      headerRight: renderHeaderRight,
    })
  }, [mode, client, hideBalance, assistantEnabled, isAuthed, LL, setModalVisible])

  // Ask Flash (ENG-733) opens the thread. A signed-out user is asked to make
  // an account first, as the home screen's buttons ask.
  const openAskFlash = () => {
    if (isAuthed) {
      navigation.navigate("askFlash")
    } else {
      setModalVisible(true)
    }
  }

  // The price icon, and right beside it Ask Flash while the assistant flag
  // is on (ENG-733).
  const renderHeaderLeft = () => (
    <HeaderRow>
      <IconWrapper
        style={assistantEnabled ? styles.pairStart : styles.alone}
        onPress={() => navigation.navigate("priceHistory")}
        activeOpacity={0.5}
      >
        <Chart color={colors.icon01} width={30} height={30} />
      </IconWrapper>
      {assistantEnabled && (
        <IconWrapper
          style={styles.pairEnd}
          onPress={openAskFlash}
          activeOpacity={0.5}
          testID="home-ask-flash"
          accessibilityRole="button"
          accessibilityLabel={LL.HomeScreen.askFlash()}
        >
          <AskFlash color={colors.icon01} width={30} height={30} />
        </IconWrapper>
      )}
    </HeaderRow>
  )

  const renderHeaderRight = () => (
    <HeaderRow>
      <IconWrapper
        style={{ paddingLeft: 20 }}
        onPress={() => saveHideBalance(client, !hideBalance)}
        activeOpacity={0.5}
      >
        <Icon
          name={hideBalance ? "eye-off" : "eye"}
          type="ionicon"
          color={colors.black}
          size={25}
        />
      </IconWrapper>
      <IconWrapper
        style={{ paddingRight: 20 }}
        onPress={() => navigation.navigate("settings")}
        activeOpacity={0.5}
      >
        <Menu color={colors.icon01} width={30} height={30} />
      </IconWrapper>
    </HeaderRow>
  )

  return null
}

export default Header

const HeaderRow = styled.View`
  height: 100%;
  flex-direction: row;
  align-items: center;
`

const IconWrapper = styled.TouchableOpacity`
  height: 100%;
  align-items: center;
  justify-content: center;
  padding-horizontal: 10px;
`

// Over IconWrapper's 10pt a side. A lone icon has 20pt on both sides. In a
// pair, each icon has 20pt on its outer side and keeps 10pt on the side it
// shares, as the eye and the menu on the right do.
const styles = StyleSheet.create({
  alone: {
    paddingHorizontal: 20,
  },
  pairStart: {
    paddingLeft: 20,
  },
  pairEnd: {
    paddingRight: 20,
  },
})
