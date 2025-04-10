import React, { useEffect } from "react"
import { TouchableOpacity } from "react-native"
import nfcManager from "react-native-nfc-manager"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { makeStyles, Text, useTheme } from "@rneui/themed"

// types
import { Invoice } from "@app/screens/receive-bitcoin-screen/payment/index.types"

// store
import { usePersistentStateContext } from "@app/store/persistent-state"

// assets
import NfcSignal from "@app/assets/icons/nfc-signal.svg"

type Props = {
  request: any
  setDisplayReceiveNfc: (val: boolean) => void
}

const Header: React.FC<Props> = ({ request, setDisplayReceiveNfc }) => {
  const navigation = useNavigation()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { persistentState } = usePersistentStateContext()

  useEffect(() => {
    if (persistentState.isAdvanceMode) {
      switch (request?.type) {
        case Invoice.OnChain:
          navigation.setOptions({ title: LL.ReceiveScreen.receiveViaOnchain() })
          break
        case Invoice.Lightning:
          navigation.setOptions({ title: LL.ReceiveScreen.receiveViaInvoice() })
          break
        case Invoice.PayCode:
          navigation.setOptions({ title: LL.ReceiveScreen.receiveViaPaycode() })
      }
    } else {
      navigation.setOptions({ title: LL.ReceiveScreen.receive() })
    }
  }, [request?.type])

  useEffect(() => {
    ;(async () => {
      if (
        request?.type === "Lightning" &&
        request?.state === "Created" &&
        (await nfcManager.isSupported())
      ) {
        navigation.setOptions({
          headerRight: renderHeaderRight,
        })
      } else {
        navigation.setOptions({ headerRight: () => <></> })
      }
    })()
  }, [colors, navigation, request?.state, request?.type])

  const renderHeaderRight = () => (
    <TouchableOpacity style={styles.nfcIcon} onPress={() => setDisplayReceiveNfc(true)}>
      <Text type="p2" style={{ marginRight: 3 }}>
        {LL.ReceiveScreen.nfc()}
      </Text>
      <NfcSignal color={colors.black} />
    </TouchableOpacity>
  )

  return null
}

export default Header

const useStyles = makeStyles(({ colors }) => ({
  nfcIcon: {
    flexDirection: "row",
    borderRadius: 8,
    backgroundColor: colors.grey5,
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
}))
