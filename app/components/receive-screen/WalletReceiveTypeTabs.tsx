import React from "react"
import { TouchableOpacity, View } from "react-native"
import { Icon, makeStyles, Text } from "@rneui/themed"

// components
import WalletBottomSheet from "./WalletBottomSheet"
import ReceiveTypeBottomSheet from "./ReceiveTypeBottomSheet"

// store
import { usePersistentStateContext } from "@app/store/persistent-state"

// types
import {
  InvoiceType,
  PaymentRequestState,
} from "@app/screens/receive-bitcoin-screen/payment/index.types"
import { WalletCurrency } from "@app/graphql/generated"

type Props = {
  request: any
}

const WalletReceiveTypeTabs: React.FC<Props> = ({ request }) => {
  const styles = useStyles()
  const { persistentState } = usePersistentStateContext()

  const onChangeWallet = (id: WalletCurrency) => {
    if (id === "BTC" && request.type === "PayCode") {
      request.setType("Lightning")
    }
    request.setReceivingWallet(id)
  }

  const onChangeReceiveType = (id: InvoiceType) => {
    request.setType(id)
  }

  if (persistentState.isAdvanceMode) {
    return (
      <View style={styles.wrapper}>
        <WalletBottomSheet
          currency={request.receivingWalletDescriptor.currency}
          disabled={request.state === PaymentRequestState.Loading}
          onChange={onChangeWallet}
        />
        <View style={{ width: 10 }} />
        <ReceiveTypeBottomSheet
          currency={request.receivingWalletDescriptor.currency}
          type={request.type}
          disabled={request.state === PaymentRequestState.Loading}
          onChange={onChangeReceiveType}
        />
      </View>
    )
  } else {
    return (
      <View style={styles.wrapper}>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => onChangeReceiveType("Lightning")}
        >
          <Icon name={"flash"} color={"#F0C243"} size={25} type="ionicon" />
          <Text type="bl">Lightning</Text>
        </TouchableOpacity>
        <View style={{ width: 10 }} />
        <TouchableOpacity
          style={styles.btn}
          onPress={() => onChangeReceiveType("OnChain")}
        >
          <Icon name={"logo-bitcoin"} color={"#41AC48"} size={25} type="ionicon" />
          <Text type="bl">Onchain</Text>
        </TouchableOpacity>
      </View>
    )
  }
}

export default WalletReceiveTypeTabs

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    flexDirection: "row",
    marginBottom: 10,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    borderWidth: 1,
    padding: 10,
    flex: 1,
    borderColor: colors.border01,
  },
}))
