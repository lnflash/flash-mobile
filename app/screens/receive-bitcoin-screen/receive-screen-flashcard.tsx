import React, { useCallback, useEffect, useState } from "react"
import { Share, TouchableOpacity, View } from "react-native"
import { RouteProp, useNavigation } from "@react-navigation/native"
import Clipboard from "@react-native-clipboard/clipboard"
import Icon from "react-native-vector-icons/Ionicons"
import { useI18nContext } from "@app/i18n/i18n-react"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { useReceiveBitcoin } from "./use-receive-bitcoin"
import { useAppSelector } from "@app/store/redux"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { QRView } from "./qr-view"

// utils
import { testProps } from "../../utils/testProps"

// types
import { Invoice, PaymentRequestState } from "./payment/index.types"

type Props = {
  route: RouteProp<RootStackParamList, "receiveBitcoinFlashcard">
}

const ReceiveScreenFlashcard = ({ route }: Props) => {
  const { userData } = useAppSelector((state) => state.user)
  const {
    theme: { colors },
  } = useTheme()
  const styles = useStyles()
  const { LL } = useI18nContext()
  const navigation = useNavigation()
  const flashcardReceiveLnurl = route.params.receiveLnurl?.validDestination.lnurl || ""
  const request = useReceiveBitcoin(false, Boolean(flashcardReceiveLnurl))
  const [lnurlp, setLnurlp] = useState("")
  useEffect(() => {
    if (request?.type === Invoice.PayCode) {
      if (flashcardReceiveLnurl) {
        navigation.setOptions({ title: LL.ReceiveScreen.topupFlashcard() })
      }
    }
  }, [LL.ReceiveScreen, flashcardReceiveLnurl, navigation, request?.type])
  const setInvoiceType = useCallback(() => {
    if (request && flashcardReceiveLnurl && request.type !== Invoice.PayCode) {
      request.setType(Invoice.PayCode) // Set type to PayCode directly
    }
  }, [request, flashcardReceiveLnurl])
  useEffect(() => {
    if (request && flashcardReceiveLnurl) {
      setLnurlp(flashcardReceiveLnurl)
      setInvoiceType()
    }
  }, [request, flashcardReceiveLnurl, setInvoiceType])
  if (!request) return <></>
  const useLnurlp =
    request.type === "PayCode" &&
    request.receivingWalletDescriptor.currency === "USD" &&
    Boolean(lnurlp) &&
    Boolean(userData.username)
  const handleCopy = () => {
    if (request.type === "PayCode" && flashcardReceiveLnurl) {
      Clipboard.setString(lnurlp)
    } else if (request.copyToClipboard) {
      request.copyToClipboard()
    }
  }
  const handleShare = async () => {
    if (useLnurlp) {
      const _result = await Share.share({ message: lnurlp })
    } else if (request.share) {
      request.share()
    }
  }

  return (
    <>
      <Screen
        preset="scroll"
        keyboardOffset="navigationHeader"
        keyboardShouldPersistTaps="handled"
        style={styles.screenStyle}
      >
        <QRView
          type={Invoice.PayCode}
          getFullUri={useLnurlp ? lnurlp : request.info?.data?.getFullUriFn}
          loading={false}
          completed={false}
          err={""}
          style={styles.qrView}
          expired={false}
          regenerateInvoiceFn={request.regenerateInvoice}
          copyToClipboard={handleCopy}
          isPayCode={request.type === Invoice.PayCode}
          canUsePayCode={useLnurlp || request.canUsePaycode}
          toggleIsSetLightningAddressModalVisible={
            request.toggleIsSetLightningAddressModalVisible
          }
        />
        {((request.state !== PaymentRequestState.Loading &&
          request.readablePaymentRequest) ||
          lnurlp) && (
          <View style={styles.extraDetails}>
            <TouchableOpacity onPress={handleCopy}>
              <Text {...testProps("readable-payment-request")}>
                {flashcardReceiveLnurl
                  ? lnurlp.substring(0, 21) + "..."
                  : request.readablePaymentRequest}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={styles.shareInvoice}>
              <Icon color={colors.grey2} name="share-outline" size={40} />
            </TouchableOpacity>
          </View>
        )}
        {request.type === "PayCode" && lnurlp && (
          <View style={styles.extraDetails}>
            <Text style={styles.instructions}>
              {LL.ReceiveScreen.flashcardInstructions()}
            </Text>
          </View>
        )}
      </Screen>
    </>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    justifyContent: "center",
    marginTop: 12,
  },
  usdActive: {
    backgroundColor: colors.green,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
    width: 150,
    height: 30,
    margin: 5,
  },
  btcActive: {
    backgroundColor: colors.primary,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
    width: 150,
    height: 30,
    margin: 5,
  },
  inactiveTab: {
    backgroundColor: colors.grey3,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
    width: 150,
    height: 30,
    margin: 5,
  },
  qrView: {
    marginBottom: 10,
  },
  receivingWalletPicker: {
    marginBottom: 10,
  },
  invoiceTypePicker: {
    marginBottom: 10,
  },
  note: {
    marginTop: 10,
  },
  extraDetails: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  invoiceDetails: {
    alignItems: "center",
    marginBottom: 10,
  },
  shareInvoice: {
    marginLeft: 5,
  },
  onchainCharges: { marginTop: 10, alignItems: "center" },
  warning: {
    fontSize: 12,
    color: colors.warning,
    marginBottom: 10,
  },
  instructions: {
    fontSize: 28,
    color: colors.green,
    marginBottom: 10,
    textAlign: "center",
  },
  nfcIcon: {
    marginTop: -1,
    marginRight: 14,
    padding: 8,
    display: "flex",
    flexDirection: "row",
    columnGap: 4,
    backgroundColor: colors.grey5,
    borderRadius: 4,
  },
}))

export default ReceiveScreenFlashcard
