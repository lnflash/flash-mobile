import React, { useCallback, useMemo, useState } from "react"
import { Alert, RefreshControl, ScrollView, TouchableOpacity, View } from "react-native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { Icon, Text, makeStyles, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useFocusEffect } from "@react-navigation/native"

// components
import { Screen } from "@app/components/screen"
import {
  BridgeKycModal,
  type TransferOption,
  TransferOptionModal,
} from "@app/components/topup-cashout-flow"

// assets
import ArrowDown from "@app/assets/icons/arrow-down-to-bracket.svg"
import ArrowUp from "@app/assets/icons/arrow-up-from-bracket.svg"

// hooks
import {
  AccountLevel,
  useBridgeAddExternalAccountMutation,
  useBridgeExternalAccountsQuery,
  useBridgeInitiateKycMutation,
  useBridgeKycStatusQuery,
} from "@app/graphql/generated"
import { useActivityIndicator, useTransferFlags } from "@app/hooks"
import { useLevel } from "@app/graphql/level-context"

type Props = StackScreenProps<RootStackParamList, "TopupCashout">

const TopupCashout: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { currentLevel } = useLevel()
  const { colors } = useTheme().theme
  const { toggleActivityIndicator } = useActivityIndicator()
  const {
    topupEnabled,
    cashoutEnabled,
    bridgeEnabled,
    refetch: refetchFlags,
  } = useTransferFlags()

  const [topupModalVisible, setTopupModalVisible] = useState(false)
  const [settleModalVisible, setSettleModalVisible] = useState(false)
  const [bridgeKycModalVisible, setBridgeKycModalVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [initiateBridgeKyc] = useBridgeInitiateKycMutation()
  const [addExternalAccount] = useBridgeAddExternalAccountMutation()

  const { data: kycStatusData, refetch: refetchKycStatus } = useBridgeKycStatusQuery({
    fetchPolicy: "cache-and-network",
    skip: !bridgeEnabled,
  })
  const { data: externalAccountsData, refetch: refetchExternalAccounts } =
    useBridgeExternalAccountsQuery({
      fetchPolicy: "cache-and-network",
      skip: !bridgeEnabled,
    })

  useFocusEffect(
    useCallback(() => {
      refetchFlags()
      if (!bridgeEnabled) return
      refetchKycStatus()
      refetchExternalAccounts()
    }, [bridgeEnabled, refetchFlags, refetchKycStatus, refetchExternalAccounts]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetchFlags()
    if (!bridgeEnabled) {
      setRefreshing(false)
      return
    }
    await refetchKycStatus()
    await refetchExternalAccounts()
    setRefreshing(false)
  }, [bridgeEnabled, refetchFlags, refetchKycStatus, refetchExternalAccounts])

  const checkAccountLevel = useCallback(
    (type: "card" | "bankTransfer" | "cashout") => {
      if (type === "card") {
        navigation.navigate("TopupDetails", { paymentType: type })
      } else if (currentLevel === AccountLevel.One) {
        Alert.alert(
          "Account upgrade required",
          "You should upgrade your account to use this feature",
          [
            { text: "Continue", onPress: () => navigation.navigate("AccountType") },
            { text: "Cancel", style: "cancel" },
          ],
        )
      } else if (type === "cashout") {
        navigation.navigate("CashoutDetails", { type: "local" })
      } else if (type === "bankTransfer") {
        navigation.navigate("BankTransfer", {
          amount: 0,
          wallet: "USD",
          paymentType: "bankTransfer",
        })
      } else {
        navigation.navigate("TopupDetails", { paymentType: type })
      }
    },
    [currentLevel, navigation],
  )

  const checkBridgeKyc = useCallback(
    async (type: "topup" | "settle") => {
      if (!bridgeEnabled) return

      if (kycStatusData?.bridgeKycStatus === "pending") {
        Alert.alert(
          "KYC Pending",
          "Your KYC status is pending. Please wait for approval.",
        )
      } else if (kycStatusData?.bridgeKycStatus === "approved") {
        if (type === "topup") {
          navigation.navigate("TopupDetails", { paymentType: "bridge" })
        } else if (
          externalAccountsData?.bridgeExternalAccounts &&
          externalAccountsData.bridgeExternalAccounts.length > 0
        ) {
          navigation.navigate("CashoutDetails", { type: "bridge" })
        } else {
          toggleActivityIndicator(true)
          const res = await addExternalAccount()
          toggleActivityIndicator(false)

          const errors = res.data?.bridgeAddExternalAccount?.errors
          if (errors && errors.length > 0) {
            // If Plaid Link is unavailable, offer manual bank entry as fallback
            if (errors[0].code === "BRIDGE_PLAID_NOT_AVAILABLE") {
              navigation.navigate("BridgeAddExternalAccount")
              return
            }
            Alert.alert("Error", errors[0].message)
            return
          }

          const linkUrl = res.data?.bridgeAddExternalAccount?.externalAccount?.linkUrl
          if (linkUrl) {
            navigation.navigate("BridgeExternalAccountWebView", { linkUrl })
          } else {
            Alert.alert("Error", "Failed to get external account link. Please try again.")
          }
        }
      } else {
        setBridgeKycModalVisible(true)
      }
    },
    [
      addExternalAccount,
      bridgeEnabled,
      externalAccountsData?.bridgeExternalAccounts,
      kycStatusData?.bridgeKycStatus,
      navigation,
      toggleActivityIndicator,
    ],
  )

  const topupOptions: TransferOption[] = useMemo(() => {
    const options: TransferOption[] = []

    if (topupEnabled) {
      options.push(
        {
          icon: "card",
          title: LL.TopUpScreen.debitCreditCard(),
          description: LL.TopUpScreen.debitCreditCardDesc(),
          onPress: () => {
            setTopupModalVisible(false)
            checkAccountLevel("card")
          },
        },
        {
          icon: "business",
          title: LL.TopUpScreen.bankTransfer(),
          description: LL.TopUpScreen.bankTransferDesc(),
          onPress: () => {
            setTopupModalVisible(false)
            checkAccountLevel("bankTransfer")
          },
        },
      )
    }

    if (bridgeEnabled) {
      options.push({
        icon: "globe",
        title: LL.TransferScreen.internationalBankTransfer(),
        description: LL.TransferScreen.internationalBankTransferDesc(),
        pending: kycStatusData?.bridgeKycStatus === "pending",
        onPress: () => {
          setTopupModalVisible(false)
          checkBridgeKyc("topup")
        },
      })
    }

    return options
  }, [
    LL,
    bridgeEnabled,
    checkAccountLevel,
    checkBridgeKyc,
    kycStatusData?.bridgeKycStatus,
    topupEnabled,
  ])

  const settleOptions: TransferOption[] = useMemo(() => {
    const options: TransferOption[] = []

    if (cashoutEnabled) {
      options.push({
        icon: "business",
        title: LL.TransferScreen.jmdBankAccount(),
        description: LL.TransferScreen.jmdBankAccountDesc(),
        onPress: () => {
          setSettleModalVisible(false)
          checkAccountLevel("cashout")
        },
      })
    }

    if (bridgeEnabled) {
      options.push({
        icon: "globe",
        title: LL.TransferScreen.internationalBankAccount(),
        description: LL.TransferScreen.internationalBankAccountDesc(),
        pending: kycStatusData?.bridgeKycStatus === "pending",
        onPress: () => {
          setSettleModalVisible(false)
          checkBridgeKyc("settle")
        },
      })
    }

    return options
  }, [
    LL,
    bridgeEnabled,
    cashoutEnabled,
    checkAccountLevel,
    checkBridgeKyc,
    kycStatusData?.bridgeKycStatus,
  ])

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
            // eslint-disable-next-line camelcase
            full_name: data.fullName,
            email: data.email,
            type: data.kycType,
          },
        },
      })
      toggleActivityIndicator(false)
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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text type="h02" bold style={styles.title}>
          {LL.TransferScreen.title()}
        </Text>
        {topupOptions.length > 0 && (
          <TouchableOpacity style={styles.btn} onPress={() => setTopupModalVisible(true)}>
            <ArrowDown color={colors.black} width={40} height={40} />
            <View style={styles.btnTextWrapper}>
              <Text type="p1">{LL.TransferScreen.topUp()}</Text>
              <Text type="p3" color={colors.grey2}>
                {LL.TransferScreen.topUpDesc()}
              </Text>
            </View>
            <Icon type="ionicon" name={"chevron-forward"} size={20} />
          </TouchableOpacity>
        )}
        {settleOptions.length > 0 && (
          <TouchableOpacity
            style={styles.btn}
            onPress={() => setSettleModalVisible(true)}
          >
            <ArrowUp color={colors.black} width={40} height={40} />
            <View style={styles.btnTextWrapper}>
              <Text type="p1"> {LL.TransferScreen.settle()}</Text>
              <Text type="p3" color={colors.grey2}>
                {LL.TransferScreen.settleDesc()}
              </Text>
            </View>
            <Icon type="ionicon" name={"chevron-forward"} size={20} />
          </TouchableOpacity>
        )}
      </ScrollView>

      <TransferOptionModal
        visible={topupModalVisible}
        title={LL.TransferScreen.selectTopUpMethod()}
        options={topupOptions}
        onClose={() => setTopupModalVisible(false)}
      />
      <TransferOptionModal
        visible={settleModalVisible}
        title={LL.TransferScreen.selectSettleMethod()}
        options={settleOptions}
        onClose={() => setSettleModalVisible(false)}
      />
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

const useStyles = makeStyles(() => ({
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  title: {
    textAlign: "center",
    marginBottom: 30,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dedede",
    marginBottom: 20,
    minHeight: 100,
    paddingHorizontal: 20,
  },
  btnTextWrapper: {
    flex: 1,
    rowGap: 5,
    marginHorizontal: 15,
  },
}))

export default TopupCashout
