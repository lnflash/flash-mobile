import React, { useCallback, useState } from "react"
import { Alert, TouchableOpacity, View } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import {
  AccountLevel,
  useBridgeInitiateKycMutation,
  useBridgeKycStatusQuery,
} from "@app/graphql/generated"
import { useFocusEffect } from "@react-navigation/native"

// components
import { Screen } from "@app/components/screen"
import { BridgeKycModal } from "@app/components/topup-cashout-flow"
import { ProgressSteps } from "@app/components/account-upgrade-flow"

// hooks
import { useLevel } from "@app/graphql/level-context"
import { useActivityIndicator } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

// store
import { useAppDispatch } from "@app/store/redux"
import { setAccountUpgrade } from "@app/store/redux/slices/accountUpgradeSlice"

type Props = StackScreenProps<RootStackParamList, "AccountType">

const AccountType: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { currentLevel } = useLevel()
  const { toggleActivityIndicator } = useActivityIndicator()

  const [bridgeKycModalVisible, setBridgeKycModalVisible] = useState(false)

  const [initiateBridgeKyc] = useBridgeInitiateKycMutation()
  const { data: kycStatusData, refetch: refetchKycStatus } = useBridgeKycStatusQuery({
    fetchPolicy: "cache-and-network",
  })

  useFocusEffect(
    useCallback(() => {
      refetchKycStatus()
    }, [refetchKycStatus]),
  )

  const bridgeKycStatus = kycStatusData?.bridgeKycStatus

  const onPress = (accountType: string) => {
    const numOfSteps =
      accountType === AccountLevel.One ? 3 : currentLevel === AccountLevel.Zero ? 5 : 4

    dispatch(setAccountUpgrade({ accountType, numOfSteps }))
    navigation.navigate("PersonalInformation")
  }

  const checkBridgeKyc = () => {
    if (bridgeKycStatus === "pending") {
      Alert.alert("KYC Pending", "Your KYC status is pending. Please wait for approval.")
    } else {
      setBridgeKycModalVisible(true)
    }
  }

  const getBridgeKycLink = async (data: {
    fullName: string
    email: string
    kycType: string
  }) => {
    toggleActivityIndicator(true)
    try {
      const res = await initiateBridgeKyc({
        variables: {
          input: {
            full_name: data.fullName,
            email: data.email,
            type: data.kycType,
          },
        },
      })
      toggleActivityIndicator(false)
      console.log("BRIDGE INITIATE KYC RESPONSE: ", res)
      const errors = res.data?.bridgeInitiateKyc?.errors
      if (errors && errors.length > 0) {
        Alert.alert("Error", errors[0].message)
        return
      }
      const kycLink = res.data?.bridgeInitiateKyc?.kycLink
      if (kycLink?.tosLink && kycLink?.kycLink) {
        navigation.navigate("BridgeKycWebView", {
          tosLink: kycLink.tosLink,
          kycLink: kycLink.kycLink,
        })
      }
    } catch (err) {
      toggleActivityIndicator(false)
      Alert.alert("Error", "Something went wrong. Please try again.")
    }
  }

  const numOfSteps = currentLevel === AccountLevel.Zero ? 3 : 4

  return (
    <Screen>
      <ProgressSteps numOfSteps={numOfSteps} currentStep={1} />
      {currentLevel === AccountLevel.Zero && (
        <TouchableOpacity style={styles.card} onPress={() => onPress(AccountLevel.One)}>
          <Icon name={"person"} size={35} color={colors.grey1} type="ionicon" />
          <View style={styles.textWrapper}>
            <Text type="bl" bold>
              {LL.AccountUpgrade.personal()}
            </Text>
            <Text type="bm" style={{ marginTop: 2 }}>
              {LL.AccountUpgrade.personalDesc()}
            </Text>
          </View>
          <Icon name={"chevron-forward"} size={25} color={colors.grey2} type="ionicon" />
        </TouchableOpacity>
      )}
      {(currentLevel === AccountLevel.Zero || currentLevel === AccountLevel.One) && (
        <TouchableOpacity style={styles.card} onPress={() => onPress(AccountLevel.Two)}>
          <Icon name={"briefcase"} size={35} color={colors.grey1} type="ionicon" />
          <View style={styles.textWrapper}>
            <Text type="bl" bold>
              {LL.AccountUpgrade.pro()}
            </Text>
            <Text type="bm" style={{ marginTop: 2 }}>
              {LL.AccountUpgrade.proDesc()}
            </Text>
          </View>
          <Icon name={"chevron-forward"} size={25} color={colors.grey2} type="ionicon" />
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.card} onPress={() => onPress(AccountLevel.Three)}>
        <Icon name={"cart"} size={35} color={colors.grey1} type="ionicon" />
        <View style={styles.textWrapper}>
          <Text type="bl" bold>
            {LL.AccountUpgrade.merchant()}
          </Text>
          <Text type="bm" style={{ marginTop: 2 }}>
            {LL.AccountUpgrade.merchantDesc()}
          </Text>
        </View>
        <Icon name={"chevron-forward"} size={25} color={colors.grey2} type="ionicon" />
      </TouchableOpacity>
      {bridgeKycStatus !== "approved" && (
        <TouchableOpacity
          style={[
            styles.card,
            bridgeKycStatus === "pending"
              ? { borderColor: "orange", borderWidth: 1 }
              : undefined,
          ]}
          onPress={checkBridgeKyc}
        >
          <Icon name={"globe"} size={35} color={colors.grey1} type="ionicon" />
          <View style={styles.textWrapper}>
            <Text type="bl" bold>
              {LL.AccountUpgrade.international()}
            </Text>
            <Text type="bm" style={{ marginTop: 2 }}>
              {LL.AccountUpgrade.internationalDesc()}
            </Text>
          </View>
          <Icon name={"chevron-forward"} size={25} color={colors.grey2} type="ionicon" />
        </TouchableOpacity>
      )}
      <BridgeKycModal
        visible={bridgeKycModalVisible}
        onClose={() => setBridgeKycModalVisible(false)}
        onSubmit={(data) => {
          setBridgeKycModalVisible(false)
          getBridgeKycLink(data)
        }}
      />
    </Screen>
  )
}

export default AccountType

const useStyles = makeStyles(({ colors }) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.grey5,
    padding: 15,
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 20,
  },
  textWrapper: {
    flex: 1,
    marginHorizontal: 15,
  },
}))
