import React, { useEffect } from "react"
import { Image } from "react-native"
import { useTheme } from "@rneui/themed"
import styled from "styled-components/native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackNavigationProp } from "@react-navigation/stack"
import messaging from "@react-native-firebase/messaging"

// hooks
import { useIsFocused, useNavigation } from "@react-navigation/native"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useApolloClient } from "@apollo/client"

// utils
import { addDeviceToken, requestNotificationPermission } from "@app/utils/notifications"

// assets
import Chart from "@app/assets/icons/chart.png"
import Menu from "@app/assets/icons/menu.png"

const Header = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()
  const isFocused = useIsFocused()
  const client = useApolloClient()

  const { colors, mode } = useTheme().theme

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
  }, [mode])

  const renderHeaderLeft = () => (
    <IconWrapper onPress={() => navigation.navigate("priceHistory")} activeOpacity={0.5}>
      <Image source={Chart} tintColor={colors.icon01} />
    </IconWrapper>
  )

  const renderHeaderRight = () => (
    <IconWrapper onPress={() => navigation.navigate("settings")} activeOpacity={0.5}>
      <Image source={Menu} tintColor={colors.icon01} />
    </IconWrapper>
  )

  return null
}

export default Header

const IconWrapper = styled.TouchableOpacity`
  height: 100%;
  align-items: center;
  justify-content: center;
  padding-horizontal: 20px;
`
