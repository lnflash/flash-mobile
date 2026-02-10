import React from "react"
import Modal from "react-native-modal"
import { View, TouchableOpacity } from "react-native"
import { StackNavigationProp } from "@react-navigation/stack"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// hooks
import { useBreez } from "@app/hooks"
import { useApolloClient } from "@apollo/client"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { useSetDefaultAccountModalQuery } from "@app/graphql/generated"
import { usePersistentStateContext } from "@app/store/persistent-state"

// utils
import { getUsdWallet } from "@app/graphql/wallets-utils"
import { setHasPromptedSetDefaultAccount } from "@app/graphql/client-only-query"

// assets
import Cash from "@app/assets/icons/cash.svg"
import Bitcoin from "@app/assets/icons/bitcoin.svg"

export type Props = {
  isVisible: boolean
  toggleModal: () => void
}

export const SetDefaultAccountModal = ({ isVisible, toggleModal }: Props) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, "Primary">>()
  const client = useApolloClient()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()
  const { updateState } = usePersistentStateContext()

  const { data } = useSetDefaultAccountModalQuery({
    fetchPolicy: "cache-only",
  })
  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)

  const onPressHandler = (currency: string) => {
    let defaultWallet = usdWallet
    if (currency === "BTC") {
      defaultWallet = btcWallet
    }
    updateState((state: any) => {
      if (state)
        return {
          ...state,
          defaultWallet,
        }
      return undefined
    })
    setHasPromptedSetDefaultAccount(client)
    toggleModal()
    navigation.navigate("receiveBitcoin")
  }

  return (
    <View>
      <Modal
        isVisible={isVisible}
        backdropOpacity={0.7}
        backdropColor={colors.grey3}
        backdropTransitionOutTiming={0}
        avoidKeyboard={true}
      >
        <View style={styles.container}>
          <TouchableOpacity style={styles.closeIcon} onPress={toggleModal}>
            <Icon name="close" size={30} type="ionicon" color={colors.black} />
          </TouchableOpacity>
          <Text type="h1" bold style={styles.text}>
            {LL.SetAccountModal.title()}
          </Text>
          <Text type={"p1"} style={styles.text}>
            {LL.SetAccountModal.description()}
          </Text>
          <View style={styles.modalActionsContainer}>
            <TouchableOpacity style={styles.button} onPress={() => onPressHandler("USD")}>
              <Cash />
              <View style={styles.buttonText}>
                <Text type={"h1"}>{LL.common.stablesatsUsd()}</Text>
                <Text type={"p3"}>{LL.SetAccountModal.stablesatsTag()}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => onPressHandler("BTC")}>
              <Bitcoin />
              <View style={styles.buttonText}>
                <Text type={"h1"}>{LL.common.bitcoin()}</Text>
                <Text type={"p3"}>{LL.SetAccountModal.bitcoinTag()}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  button: {
    minHeight: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    columnGap: 12,
    padding: 12,
    backgroundColor: colors.grey4,
  },
  buttonText: {
    flex: 1,
  },
  container: {
    maxHeight: "80%",
    borderRadius: 20,
    padding: 20,
    backgroundColor: colors.white,
  },
  text: {
    marginBottom: 10,
    textAlign: "center",
  },
  modalActionsContainer: {
    rowGap: 10,
    marginTop: 10,
  },
  closeIcon: {
    width: "100%",
    alignItems: "flex-end",
  },
}))
