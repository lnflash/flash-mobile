import React, { useCallback, useEffect } from "react"
import { View } from "react-native"
import { ApolloError } from "@apollo/client"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useNetInfo } from "@react-native-community/netinfo"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { usePersistentStateContext } from "@app/store/persistent-state"

// components
import { GaloyErrorBox } from "../atomic/galoy-error-box"

// gql
import { GraphQLError } from "graphql"
import { GraphQlApplicationError } from "@app/graphql/generated"
import { getErrorMessages } from "@app/graphql/utils"

// breez
import { breezSDKInitialized, listUnclaimedDeposits } from "@app/utils/breez-sdk"

type ErrorInput =
  | readonly GraphQLError[]
  | readonly GraphQlApplicationError[]
  | ApolloError

type Props = {
  refreshTriggered: boolean
  error?: ErrorInput
}

const Info: React.FC<Props> = ({ refreshTriggered, error }) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()
  const { colors, mode } = useTheme().theme
  const { LL } = useI18nContext()
  const { isInternetReachable } = useNetInfo()
  const { persistentState, updateState } = usePersistentStateContext()

  const { isAdvanceMode, unclaimedDeposits = 0 } = persistentState
  const warningColor = mode === "light" ? colors.warning : colors.black
  const hasUnclaimedDeposits = unclaimedDeposits > 0

  useEffect(() => {
    if (isAdvanceMode && breezSDKInitialized) {
      fetchUnclaimedDeposits()
    }
  }, [refreshTriggered, breezSDKInitialized, isAdvanceMode])
  const fetchUnclaimedDeposits = useCallback(async () => {
    try {
      const deposits = (await listUnclaimedDeposits()) || []
      updateState((state) => {
        if (!state) return undefined
        return { ...state, unclaimedDeposits: deposits.length }
      })
    } catch (err) {
      console.log("List Unclaimed Deposits Err: ", err)
    }
  }, [updateState])

  const handleNavigation = useCallback(() => {
    navigation.navigate("UnclaimedDepositsList")
  }, [navigation])

  if (isInternetReachable === false) {
    return (
      <View style={styles.wrapper}>
        <GaloyErrorBox errorMessage="Wallet is offline" />
      </View>
    )
  }

  if (!error && !hasUnclaimedDeposits) {
    return null
  }

  return (
    <View style={styles.wrapper}>
      {hasUnclaimedDeposits && (
        <View style={styles.container}>
          <Text type="p3" color={warningColor}>
            {`${LL.HomeScreen.unclaimedDepositsWarning()}  `}
            <Text bold type="p3" color={colors.primary} onPress={handleNavigation}>
              {LL.HomeScreen.unclaimedDeposits()}
            </Text>
          </Text>
        </View>
      )}
      {error && hasUnclaimedDeposits && <View style={styles.spacer} />}
      {error && <GaloyErrorBox errorMessage={getErrorMessages(error)} />}
    </View>
  )
}

export default Info

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    marginTop: 5,
    marginHorizontal: 20,
  },
  container: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.warning9,
  },
  spacer: {
    height: 5,
  },
}))
