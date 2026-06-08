import { useCallback, useState } from "react"
import { Alert } from "react-native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useBridgeInitiateKycMutation } from "@app/graphql/generated"

import { useActivityIndicator } from "./useActivityIndicator"

type BridgeKycNavigation = {
  navigate: (
    screen: "BridgeKycWebView",
    params: RootStackParamList["BridgeKycWebView"],
  ) => void
}

type BridgeKycData = {
  fullName: string
  email: string
  kycType: string
}

export const useBridgeKyc = ({ navigation }: { navigation: BridgeKycNavigation }) => {
  const { toggleActivityIndicator } = useActivityIndicator()
  const [initiateBridgeKyc] = useBridgeInitiateKycMutation()
  const [bridgeKycModalVisible, setBridgeKycModalVisible] = useState(false)

  const openBridgeKycModal = useCallback(() => {
    setBridgeKycModalVisible(true)
  }, [])

  const closeBridgeKycModal = useCallback(() => {
    setBridgeKycModalVisible(false)
  }, [])

  const submitBridgeKyc = useCallback(
    async (data: BridgeKycData) => {
      setBridgeKycModalVisible(false)
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
        Alert.alert("Error", "Something went wrong. Please try again.")
      } finally {
        toggleActivityIndicator(false)
      }
    },
    [initiateBridgeKyc, navigation, toggleActivityIndicator],
  )

  return {
    bridgeKycModalVisible,
    openBridgeKycModal,
    closeBridgeKycModal,
    submitBridgeKyc,
  }
}
