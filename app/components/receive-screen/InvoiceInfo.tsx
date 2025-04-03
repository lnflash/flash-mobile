import React from "react"
import moment from "moment"
import { Share, TouchableOpacity, View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { useI18nContext } from "@app/i18n/i18n-react"

// types
import {
  Invoice,
  PaymentRequestState,
} from "@app/screens/receive-bitcoin-screen/payment/index.types"

// utils
import { testProps } from "../../utils/testProps"

// assets
import ShareIcon from "@app/assets/icons/share-new.svg"

type Props = {
  request: any
  lnurlp?: string
  handleCopy: () => void
}

const InvoiceInfo: React.FC<Props> = ({ request, lnurlp, handleCopy }) => {
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const styles = useStyles()

  const handleShare = async () => {
    if (!!lnurlp) {
      const result = await Share.share({ message: lnurlp })
    } else {
      if (request.share) {
        request.share()
      }
    }
  }

  if (request.state !== PaymentRequestState.Loading) {
    return (
      <View style={styles.wrapper}>
        {request.info?.data?.invoiceType === Invoice.Lightning && (
          <Text type="caption" color={colors.placeholder} style={styles.invoiceDetails}>
            {request.state === PaymentRequestState.Expired
              ? LL.ReceiveScreen.invoiceHasExpired()
              : `Valid for ${moment(request.info.data.expiresAt).fromNow(true)}`}
          </Text>
        )}
        {request.readablePaymentRequest && (
          <View style={styles.extraDetails}>
            <TouchableOpacity onPress={handleCopy}>
              <Text type="bl" {...testProps("readable-payment-request")}>
                {request.readablePaymentRequest}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={styles.shareInvoice}>
              <ShareIcon color={colors.accent02} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    )
  } else {
    return null
  }
}

export default InvoiceInfo

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    marginBottom: 20,
  },
  invoiceDetails: {
    textAlign: "center",
    marginBottom: 2,
  },
  extraDetails: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  shareInvoice: {
    marginLeft: 5,
  },
}))
