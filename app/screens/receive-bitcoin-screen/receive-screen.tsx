import { Screen } from "@app/components/screen"
import { Network, WalletCurrency } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { requestNotificationPermission } from "@app/utils/notifications"
import { useIsFocused, useNavigation } from "@react-navigation/native"
import React, { useEffect } from "react"
import { TouchableOpacity, View } from "react-native"
import { testProps } from "../../utils/testProps"
import { withMyLnUpdateSub } from "./my-ln-updates-sub"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { ButtonGroup } from "@app/components/button-group"
import { useReceiveBitcoin } from "./use-receive-bitcoin"
import {
  Invoice,
  InvoiceType,
  PaymentRequestState,
  InvoiceData,
} from "./payment/index.types"
import { QRView } from "./qr-view"
import { AmountInput } from "@app/components/amount-input"
import { NoteInput } from "@app/components/note-input"
import Icon from "react-native-vector-icons/Ionicons"
import { SetLightningAddressModal } from "@app/components/set-lightning-address-modal"
import { GaloyCurrencyBubble } from "@app/components/atomic/galoy-currency-bubble"

// Breez SDK
import { receivePaymentBreezSDK } from "@app/utils/breez-sdk"
import { LnInvoice, addEventListener } from "@breeztech/react-native-breez-sdk"
import { getPaymentRequestFullUri } from "./payment/helpers"

const ReceiveScreen = () => {
  const {
    theme: { colors },
  } = useTheme()
  const styles = useStyles()
  const { LL } = useI18nContext()
  const navigation = useNavigation()

  const isAuthed = useIsAuthed()
  const isFocused = useIsFocused()

  const request = useReceiveBitcoin()
  const [formattedBreezInvoiceState, setFormattedBreezInvoiceState] =
    React.useState<InvoiceData | null>(null)
  // create a new variable to hold the updated request, initialized to be null and of the same type as request
  const [updatedRequest, setUpdatedRequest] = React.useState<typeof request>(null)

  useEffect(() => {
    const fetchBreezInvoice = async () => {
      if (isAuthed && isFocused) {
        try {
          const fetchedBreezInvoice = await receivePaymentBreezSDK(2501, "")
          populateFormattedBreezInvoice(fetchedBreezInvoice)
        } catch (error) {
          console.error("Error fetching breezInvoice:", error)
        }
      }
    }
    fetchBreezInvoice()
  }, [isAuthed, isFocused])

  const populateFormattedBreezInvoice = (rawInvoiceData: LnInvoice) => {
    if (rawInvoiceData) {
      // Step 1: Format the breezInvoice to match the structure of request.info.data
      const formattedBreezInvoice: InvoiceData = {
        invoiceType: Invoice.Lightning,
        paymentHash: rawInvoiceData.paymentHash,
        paymentRequest: rawInvoiceData.bolt11,
        paymentSecret: rawInvoiceData.paymentSecret
          ? Array.from(rawInvoiceData.paymentSecret)
              .map((byte) => byte.toString(16))
              .join("")
          : "",
        // Converting the timestamp to a Date object
        expiresAt: new Date(Date.now() + rawInvoiceData.expiry * 1000),
        __typename: "LnInvoice",
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        getFullUriFn: ({ uppercase, prefix }) =>
          getPaymentRequestFullUri({
            type: Invoice.Lightning,
            input: rawInvoiceData.bolt11 || "",
            amount: (rawInvoiceData.amountMsat || 2500001) / 1000,
            memo: rawInvoiceData.description,
            uppercase,
            prefix,
          }),
      }
      setFormattedBreezInvoiceState(formattedBreezInvoice)
    }
  }

  useEffect(() => {
    // async function to update the request with the formatted breezInvoice
    const updateRequest = async (formattedInvoiceData: InvoiceData | null) => {
      if (request?.info?.data && request?.creationData && formattedInvoiceData) {
        const uri = formattedInvoiceData.getFullUriFn({})
        const newRequest = {
          ...request,
          info: {
            ...request.info,
            data: formattedInvoiceData,
          },
          network: Network.Mainnet,
          creationData: {
            ...request.creationData,
            network: Network.Mainnet,
          },
          extraDetails: "Breez Invoice | Valid for 7 days",
          readablePaymentRequest: `${uri.slice(0, 10)}..${uri.slice(-10)}`,
        }
        setUpdatedRequest(newRequest)
        if (updatedRequest?.info?.data) {
          console.log("-------------------------------------------")
          console.log("Completed Fetching Breez Invoice and Request Object")
          console.log("readablePaymentRequest:", updatedRequest.readablePaymentRequest)
          console.log("-------------------------------------------")
        }
      } else {
        // Handle the case when request.info is undefined
        console.log("request is still undefined")
      }
    }
    updateRequest(formattedBreezInvoiceState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.info?.data, formattedBreezInvoiceState, updatedRequest?.info?.data])

  // SDK events listener
  useEffect(() => {
    addEventListener((type) => {
      if (type === "invoicePaid") {
        // update the request state to paid on the updatedRequest object
        setUpdatedRequest((prevState) => {
          return {
            ...prevState,
            state: PaymentRequestState.Paid,
          }
        })
      }
    })
  }, [])
  // notification permission
  useEffect(() => {
    let timeout: NodeJS.Timeout
    if (isAuthed && isFocused) {
      const WAIT_TIME_TO_PROMPT_USER = 5000
      timeout = setTimeout(
        requestNotificationPermission, // no op if already requested
        WAIT_TIME_TO_PROMPT_USER,
      )
    }
    return () => timeout && clearTimeout(timeout)
  }, [isAuthed, isFocused])

  useEffect(() => {
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
  }, [request?.type, LL.ReceiveScreen, navigation])

  useEffect(() => {
    if (updatedRequest?.state === PaymentRequestState.Paid) {
      const id = setTimeout(() => navigation.goBack(), 5000)
      return () => clearTimeout(id)
    }
  }, [updatedRequest?.state, navigation])

  if (!request) return <></>

  const OnChainCharge =
    request.feesInformation?.deposit.minBankFee &&
    request.feesInformation?.deposit.minBankFeeThreshold &&
    request.type === Invoice.OnChain ? (
      <View style={styles.onchainCharges}>
        <Text type="p4">
          {LL.ReceiveScreen.fees({
            minBankFee: request.feesInformation?.deposit.minBankFee,
            minBankFeeThreshold: request.feesInformation?.deposit.minBankFeeThreshold,
          })}
        </Text>
      </View>
    ) : undefined

  const isReady = request.state !== PaymentRequestState.Loading

  return (
    <>
      <Screen
        preset="scroll"
        keyboardOffset="navigationHeader"
        keyboardShouldPersistTaps="handled"
        style={styles.screenStyle}
      >
        <ButtonGroup
          selectedId={request.receivingWalletDescriptor.currency}
          buttons={[
            {
              id: WalletCurrency.Btc,
              text: LL.ReceiveScreen.bitcoin(),
              icon: {
                selected: <GaloyCurrencyBubble currency="BTC" iconSize={16} />,
                normal: (
                  <GaloyCurrencyBubble currency="BTC" iconSize={16} highlighted={false} />
                ),
              },
            },
            {
              id: WalletCurrency.Usd,
              text: LL.ReceiveScreen.stablesats(),
              icon: {
                selected: <GaloyCurrencyBubble currency="USD" iconSize={16} />,
                normal: (
                  <GaloyCurrencyBubble currency="USD" iconSize={16} highlighted={false} />
                ),
              },
            },
          ]}
          onPress={(id) => isReady && request.setReceivingWallet(id as WalletCurrency)}
          style={styles.receivingWalletPicker}
          disabled={!request.canSetReceivingWalletDescriptor}
        />

        <QRView
          type={updatedRequest?.info?.data?.invoiceType || Invoice.OnChain}
          getFullUri={updatedRequest?.info?.data?.getFullUriFn}
          loading={updatedRequest?.state === PaymentRequestState.Loading}
          completed={updatedRequest?.state === PaymentRequestState.Paid}
          err={
            updatedRequest?.state === PaymentRequestState.Error
              ? LL.ReceiveScreen.error()
              : ""
          }
          style={styles.qrView}
          expired={updatedRequest?.state === PaymentRequestState.Expired}
          regenerateInvoiceFn={request.regenerateInvoice}
          copyToClipboard={request.copyToClipboard}
          isPayCode={request.type === Invoice.PayCode}
          canUsePayCode={request.canUsePaycode}
          toggleIsSetLightningAddressModalVisible={
            request.toggleIsSetLightningAddressModalVisible
          }
        />

        <View style={styles.invoiceActions}>
          {request.state !== PaymentRequestState.Loading &&
            (request.type !== Invoice.PayCode ||
              (request.type === Invoice.PayCode && request.canUsePaycode)) && (
              <>
                <View style={styles.copyInvoiceContainer}>
                  <TouchableOpacity
                    {...testProps(LL.ReceiveScreen.copyInvoice())}
                    onPress={updatedRequest?.copyToClipboard}
                  >
                    <Text {...testProps("Copy Invoice")} color={colors.grey2}>
                      <Icon color={colors.grey2} name="copy-outline" />
                      <Text> </Text>
                      {LL.ReceiveScreen.copyInvoice()}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View>
                  <Text color={colors.grey2}>{updatedRequest?.extraDetails || ""}</Text>
                </View>
                <View style={styles.shareInvoiceContainer}>
                  <TouchableOpacity
                    {...testProps(LL.ReceiveScreen.shareInvoice())}
                    onPress={request.share}
                  >
                    <Text {...testProps("Share Invoice")} color={colors.grey2}>
                      <Icon color={colors.grey2} name="share-outline" />
                      <Text> </Text>
                      {LL.ReceiveScreen.shareInvoice()}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
        </View>

        <TouchableOpacity onPress={updatedRequest?.copyToClipboard}>
          <View style={styles.extraDetails}>
            {updatedRequest?.readablePaymentRequest && (
              <Text {...testProps("readable-payment-request")}>
                {updatedRequest.readablePaymentRequest}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <ButtonGroup
          selectedId={request.type}
          buttons={[
            {
              id: Invoice.Lightning,
              text: LL.ReceiveScreen.lightning(),
              icon: "md-flash",
            },
            { id: Invoice.PayCode, text: LL.ReceiveScreen.paycode(), icon: "md-at" },
            {
              id: Invoice.OnChain,
              text: LL.ReceiveScreen.onchain(),
              icon: "logo-bitcoin",
            },
          ]}
          onPress={(id) => isReady && request.setType(id as InvoiceType)}
          style={styles.invoiceTypePicker}
        />
        <AmountInput
          unitOfAccountAmount={request.unitOfAccountAmount}
          setAmount={request.setAmount}
          canSetAmount={request.canSetAmount}
          convertMoneyAmount={request.convertMoneyAmount}
          walletCurrency={request.receivingWalletDescriptor.currency}
          showValuesIfDisabled={false}
          big={false}
        />
        <NoteInput
          onBlur={request.setMemo}
          onChangeText={request.setMemoChangeText}
          value={request.memoChangeText || ""}
          editable={request.canSetMemo}
          style={styles.note}
          big={false}
        />

        {OnChainCharge}

        <SetLightningAddressModal
          isVisible={request.isSetLightningAddressModalVisible}
          toggleModal={request.toggleIsSetLightningAddressModalVisible}
        />
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
    marginBottom: 15,
    minHeight: 20,
  },
  invoiceActions: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 10,
    minHeight: 20,
  },
  copyInvoiceContainer: {
    flex: 2,
    marginLeft: 10,
  },
  shareInvoiceContainer: {
    flex: 2,
    alignItems: "flex-end",
    marginRight: 10,
  },
  onchainCharges: { marginTop: 10, alignItems: "center" },
}))

export default withMyLnUpdateSub(ReceiveScreen)
