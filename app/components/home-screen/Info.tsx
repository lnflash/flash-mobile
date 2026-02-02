import React, { useEffect } from "react"
import { View } from "react-native"
import { ApolloError } from "@apollo/client"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { listUnclaimedDeposits } from "@app/utils/breez-sdk-spark"
import { useNetInfo } from "@react-native-community/netinfo"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"

// components
import { GaloyIcon } from "../atomic/galoy-icon"
import { GaloyErrorBox } from "../atomic/galoy-error-box"

// gql
import { GraphQLError } from "graphql"
import { GraphQlApplicationError } from "@app/graphql/generated"
import { getErrorMessages } from "@app/graphql/utils"

// utils
import { usePersistentStateContext } from "@app/store/persistent-state"
import { breezSDKInitialized } from "@app/utils/breez-sdk-spark"

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
  const netInfo = useNetInfo()

  const { persistentState, updateState } = usePersistentStateContext()

  const color = mode === "light" ? colors.warning : colors.black

  useEffect(() => {
    if (persistentState.isAdvanceMode && breezSDKInitialized) {
      fetchRefundables()
    }
  }, [refreshTriggered, breezSDKInitialized, persistentState.isAdvanceMode])

  const fetchRefundables = async () => {
    try {
      const refundables = (await listUnclaimedDeposits()) || []
      updateState((state: any) => {
        if (state)
          return {
            ...state,
            numOfRefundables: refundables.length,
          }
        return undefined
      })
    } catch (err) {
      console.log("List Refundables Err: ", err)
    }
  }
  if (!netInfo.isInternetReachable) {
    return (
      <View style={styles.wrapper}>
        <GaloyErrorBox errorMessage={"Wallet is offline"} />
      </View>
    )
  } else if (error || persistentState?.numOfRefundables > 0) {
    return (
      <View style={styles.wrapper}>
        {persistentState?.numOfRefundables > 0 && (
          <View style={styles.container}>
            <GaloyIcon name="warning" size={14} color={color} />
            <Text style={styles.textContainer} type={"p3"} color={color}>
              {`${LL.HomeScreen.refundableWarning()}  `}
              <Text
                bold
                type={"p3"}
                color={colors.primary}
                onPress={() => navigation.navigate("RefundTransactionList")}
              >
                {LL.HomeScreen.refundables()}
              </Text>
            </Text>
          </View>
        )}
        {error && persistentState?.numOfRefundables > 0 && <View style={{ height: 5 }} />}
        {error && <GaloyErrorBox errorMessage={getErrorMessages(error)} />}
      </View>
    )
  } else {
    return null
  }
}

export default Info

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    marginTop: 5,
    marginHorizontal: 20,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.warning9,
  },
  textContainer: {
    overflow: "hidden",
    marginLeft: 4,
    flex: 1,
  },
}))
