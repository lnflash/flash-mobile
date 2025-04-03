import React, { useEffect } from "react"
import { Icon, useTheme } from "@rneui/themed"
import styled from "styled-components/native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackNavigationProp } from "@react-navigation/stack"
import messaging from "@react-native-firebase/messaging"

// hooks
import { useIsFocused, useNavigation } from "@react-navigation/native"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useApolloClient } from "@apollo/client"
import { useHideBalanceQuery } from "@app/graphql/generated"

// utils
import { addDeviceToken, requestNotificationPermission } from "@app/utils/notifications"
import { saveHideBalance } from "@app/graphql/client-only-query"

// assets
import Chart from "@app/assets/icons/chart.svg"
import Menu from "@app/assets/icons/setting.svg"

const Header = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()
  const isFocused = useIsFocused()
  const client = useApolloClient()

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
            result === messaging.AuthorizationStatus.PROVISIONAL ||
            result === messaging.AuthorizationStatus.AUTHORIZED
          ) {
            await addDeviceToken(client)
          }
        }, // no op if already requested
        5000,
      )
    }
    return () => timeout && clearTimeout(timeout)
  }, [isAuthed, isFocused, client])

  useEffect(() => {
    navigation.setOptions({
      headerLeft: renderHeaderLeft,
      headerRight: renderHeaderRight,
    })
  }, [mode, client, hideBalance])

  const renderHeaderLeft = () => (
    <IconWrapper
      style={{ paddingHorizontal: 20 }}
      onPress={() => navigation.navigate("priceHistory")}
      activeOpacity={0.5}
    >
      <Chart color={colors.icon01} width={30} height={30} />
    </IconWrapper>
  )

  const renderHeaderRight = () => (
    <HeaderRight>
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
    </HeaderRight>
  )

  return null
}

export default Header

const HeaderRight = styled.View`
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
