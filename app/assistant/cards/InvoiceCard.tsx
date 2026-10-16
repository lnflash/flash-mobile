import React, { useState } from "react"
import { Share, View } from "react-native"
import QRCode from "react-native-qrcode-svg"
import Clipboard from "@react-native-clipboard/clipboard"
import { makeStyles } from "@rneui/themed"

import { useI18nContext } from "@app/i18n/i18n-react"
import { lightningInvoiceValidity } from "@app/screens/receive-bitcoin-screen/payment/helpers"
import {
  CardButton,
  CardError,
  CardFrame,
  CardNotice,
  CardRow,
  validCardOf,
  walletName,
} from "./card-parts"
import type { InvoiceCard as InvoicePayload } from "./types"
import { useSecondsLeft } from "./use-expired"

// A payment request (prepareReceive; spec §5, §6): the QR the receive
// screen would show, the amount asked for, and Copy and Share for the
// request in full. There is nothing to confirm. A Lightning request counts
// down as the receive screen's does, and once it expires its QR and buttons
// go: an expired invoice must not be handed on.

const QR_SIZE = 220

const InvoiceCardBody: React.FC<{ card: InvoicePayload }> = ({ card }) => {
  const { LL } = useI18nContext()
  const styles = useStyles()
  const secondsLeft = useSecondsLeft(card.expiresAt)
  const [copied, setCopied] = useState(false)
  const expired = secondsLeft === 0

  const validity =
    card.method === "onchain"
      ? LL.ReceiveScreen.yourBitcoinOnChainAddress()
      : secondsLeft === undefined
      ? undefined
      : expired
      ? LL.ReceiveScreen.invoiceExpired()
      : `${LL.ReceiveScreen.singleUse()} | ${lightningInvoiceValidity(LL, secondsLeft)}`

  return (
    <CardFrame title={LL.AssistantCards.invoiceTitle()} testID="assistant-card-invoice">
      {expired ? null : (
        <View style={styles.qr} testID="assistant-card-qr">
          <QRCode value={card.paymentRequest} size={QR_SIZE} />
        </View>
      )}
      {card.amountText ? (
        <CardRow
          label={LL.SendBitcoinScreen.amount()}
          value={card.amountText}
          testID="assistant-card-amount"
        />
      ) : null}
      <CardRow
        label={LL.common.to()}
        value={walletName(LL, card.receiveWallet)}
        testID="assistant-card-wallet"
      />
      {validity ? <CardNotice text={validity} testID="assistant-card-validity" /> : null}
      {expired ? null : (
        <>
          <CardButton
            label={LL.ReceiveScreen.copyInvoice()}
            outline
            onPress={() => {
              Clipboard.setString(card.shareText)
              setCopied(true)
            }}
            testID="assistant-card-copy"
          />
          <CardButton
            label={LL.ReceiveScreen.shareInvoice()}
            onPress={() => {
              Share.share({ message: card.shareText }).catch(() => undefined)
            }}
            testID="assistant-card-share"
          />
          {copied ? <CardNotice text={LL.common.copied()} /> : null}
        </>
      )}
    </CardFrame>
  )
}

export const InvoiceCard: React.FC<{ payload: unknown }> = ({ payload }) => {
  const card = validCardOf(payload, "invoice")
  if (!card) return <CardError />
  return <InvoiceCardBody card={card} />
}

const useStyles = makeStyles(() => ({
  qr: {
    alignItems: "center",
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
}))
