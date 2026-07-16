import { useCallback, useState } from "react"
import { Alert } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import {
  useBridgeInitiateKycMutation,
  useBridgeKycStatusQuery,
} from "@app/graphql/generated"
import { useFeatureFlags } from "@app/config/feature-flags-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

import { useActivityIndicator } from "./useActivityIndicator"

export type BridgeKycDetails = {
  fullName: string
  email: string
  kycType: string
}

/**
 * Bridge KYC entry point (the usdAccount capability, ENG-516). Owns the
 * status query, the details-modal visibility, and the initiate-KYC mutation;
 * callers render <BridgeKycModal> wired to the returned state. Extracted from
 * AccountType so other screens (e.g. Bank accounts) can launch KYC directly
 * instead of routing through the upgrade picker.
 */
export const useBridgeKyc = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { bridgeTopupEnabled } = useFeatureFlags()
  const { toggleActivityIndicator } = useActivityIndicator()
  const { LL } = useI18nContext()

  const [kycModalVisible, setKycModalVisible] = useState(false)

  const [initiateBridgeKyc] = useBridgeInitiateKycMutation()
  const { data: kycStatusData, refetch: refetchKycStatus } = useBridgeKycStatusQuery({
    fetchPolicy: "cache-and-network",
    skip: !bridgeTopupEnabled,
  })

  const bridgeKycStatus = kycStatusData?.bridgeKycStatus

  // No-op when Bridge is remotely disabled; alerts instead of opening the
  // modal while a KYC submission is already pending.
  const startBridgeKyc = useCallback(() => {
    if (!bridgeTopupEnabled) return
    if (bridgeKycStatus === "pending") {
      Alert.alert(LL.BridgeKyc.pendingTitle(), LL.BridgeKyc.pendingBody())
      return
    }
    setKycModalVisible(true)
  }, [bridgeTopupEnabled, bridgeKycStatus, LL])

  const closeKycModal = useCallback(() => setKycModalVisible(false), [])

  const submitBridgeKyc = useCallback(
    async (details: BridgeKycDetails) => {
      setKycModalVisible(false)
      toggleActivityIndicator(true)
      try {
        const res = await initiateBridgeKyc({
          variables: {
            input: {
              // eslint-disable-next-line camelcase -- GraphQL input field name
              full_name: details.fullName,
              email: details.email,
              type: details.kycType,
            },
          },
        })
        toggleActivityIndicator(false)
        const errors = res.data?.bridgeInitiateKyc?.errors
        if (errors && errors.length > 0) {
          Alert.alert(LL.common.error(), errors[0].message)
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
        Alert.alert(LL.common.error(), LL.BridgeKyc.genericError())
      }
    },
    [initiateBridgeKyc, navigation, toggleActivityIndicator, LL],
  )

  return {
    bridgeTopupEnabled,
    bridgeKycStatus,
    refetchKycStatus,
    kycModalVisible,
    startBridgeKyc,
    closeKycModal,
    submitBridgeKyc,
  }
}
