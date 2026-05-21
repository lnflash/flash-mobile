import React, { useCallback, useMemo, useState } from "react"
import { Alert, RefreshControl, ScrollView, TouchableOpacity, View } from "react-native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { Icon, Text, makeStyles, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useFocusEffect } from "@react-navigation/native"

// components
import { Screen } from "@app/components/screen"
import { TransferOptionModal, BridgeKycModal } from "@app/components/topup-cashout-flow"
import type { TransferOption } from "@app/components/topup-cashout-flow"

// assets
import ArrowDown from "@app/assets/icons/arrow-down-to-bracket.svg"
import ArrowUp from "@app/assets/icons/arrow-up-from-bracket.svg"

// hooks
import {
  useBridgeInitiateKycMutation,
  useBridgeKycStatusQuery,
} from "@app/graphql/generated"
import { useActivityIndicator } from "@app/hooks"

type Props = StackScreenProps<RootStackParamList, "TopupCashout">

const TopupCashout: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const { toggleActivityIndicator } = useActivityIndicator()

  const [topupModalVisible, setTopupModalVisible] = useState(false)
  const [settleModalVisible, setSettleModalVisible] = useState(false)
  const [bridgeKycModalVisible, setBridgeKycModalVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [initiateBridgeKyc] = useBridgeInitiateKycMutation()
  const { data: kycStatusData, refetch: refetchKycStatus } = useBridgeKycStatusQuery({
    fetchPolicy: "cache-and-network",
  })

  useFocusEffect(
    useCallback(() => {
      refetchKycStatus()
    }, [refetchKycStatus]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetchKycStatus()
    setRefreshing(false)
  }, [refetchKycStatus])

  const topupOptions: TransferOption[] = useMemo(
    () => [
      {
        icon: "card",
        title: LL.TopUpScreen.debitCreditCard(),
        description: LL.TopUpScreen.debitCreditCardDesc(),
        onPress: () => {
          setTopupModalVisible(false)
          navigation.navigate("TopupDetails", { paymentType: "card" })
        },
      },
      {
        icon: "business",
        title: LL.TopUpScreen.bankTransfer(),
        description: LL.TopUpScreen.bankTransferDesc(),
        onPress: () => {
          setTopupModalVisible(false)
          navigation.navigate("TopupDetails", { paymentType: "bankTransfer" })
        },
      },
      {
        icon: "globe",
        title: LL.TransferScreen.internationalBankTransfer(),
        description: LL.TransferScreen.internationalBankTransferDesc(),
        pending: kycStatusData?.bridgeKycStatus === "pending",
        onPress: () => {
          setTopupModalVisible(false)
          checkBridgeKyc("topup")
        },
      },
    ],
    [LL, navigation, kycStatusData?.bridgeKycStatus],
  )

  const settleOptions: TransferOption[] = useMemo(
    () => [
      {
        icon: "business",
        title: LL.TransferScreen.jmdBankAccount(),
        description: LL.TransferScreen.jmdBankAccountDesc(),
        onPress: () => {
          setSettleModalVisible(false)
          navigation.navigate("CashoutDetails")
        },
      },
      {
        icon: "globe",
        title: LL.TransferScreen.internationalBankAccount(),
        description: LL.TransferScreen.internationalBankAccountDesc(),
        pending: kycStatusData?.bridgeKycStatus === "pending",
        onPress: () => {
          setSettleModalVisible(false)
          checkBridgeKyc("settle")
        },
      },
    ],
    [LL, navigation, kycStatusData?.bridgeKycStatus],
  )

  const checkBridgeKyc = (type: "topup" | "settle") => {
    if (kycStatusData?.bridgeKycStatus === "pending") {
      Alert.alert("KYC Pending", "Your KYC status is pending. Please wait for approval.")
    } else if (kycStatusData?.bridgeKycStatus === "approved") {
      type === "topup"
        ? navigation.navigate("TopupDetails", { paymentType: "bridge" })
        : navigation.navigate("CashoutDetails")
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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text type="h02" bold style={styles.title}>
          {LL.TransferScreen.title()}
        </Text>
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
        <TouchableOpacity style={styles.btn} onPress={() => setSettleModalVisible(true)}>
          <ArrowUp color={colors.black} width={40} height={40} />
          <View style={styles.btnTextWrapper}>
            <Text type="p1"> {LL.TransferScreen.settle()}</Text>
            <Text type="p3" color={colors.grey2}>
              {LL.TransferScreen.settleDesc()}
            </Text>
          </View>
          <Icon type="ionicon" name={"chevron-forward"} size={20} />
        </TouchableOpacity>
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
