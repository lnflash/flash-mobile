import Clipboard from "@react-native-clipboard/clipboard"
import { toastShow } from "@app/utils/toast"
import { sha256 } from "js-sha256"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { RootStackParamList } from "@app/navigation/stack-param-lists"
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import {
  AccessibilityInfo,
  Alert,
  FlatList,
  Linking,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useApolloClient } from "@apollo/client"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"

import { GaloyErrorBox } from "@app/components/atomic/galoy-error-box"
import { Screen } from "@app/components/screen"
import { TxItem } from "@app/components/transaction-item"
import { useFeatureFlags } from "@app/config/feature-flags-context"
import { useAppConfig } from "@app/hooks/use-app-config"
import { useConnectivity } from "@app/hooks/use-connectivity"
import { useOpenSupportChat } from "@app/hooks/use-open-support-chat"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { Animated, useKeyboardPaddingStyle } from "@app/hooks/use-keyboard-padding"
import { usePriceConversion } from "@app/hooks/use-price-conversion"
import { useI18nContext } from "@app/i18n/i18n-react"
import type { UnifiedTransaction } from "@app/types/transactions"
import { formatBreezPayment } from "@app/utils/transactions"
import { ActionCardView } from "../cards/ActionCardView"
import type { CardActions } from "../cards/card-actions"
import { replyText } from "../cards/card-parts"
import { registerModelEvalHook } from "../engine/model-eval-hook"
import type {
  BalancesProjection,
  PricePayload,
  TransactionsProjection,
} from "../registry/projections"
import { HELP_ACTIONS, HelpTopic } from "./first-use-help"
import { getAssistantRuntime } from "./assistant-runtime"
import { ListedTransaction, listedKey, ThreadEntry } from "./thread-store"
import type { TurnEnv } from "./turn"
import { useThread } from "./use-thread"
import { i18nObject } from "@app/i18n/i18n-util"
import { SpeechSettings } from "./speech-settings"
import { useSpeechOutput } from "./use-speech-output"
import { spokenReplyFor } from "./spoken-reply"
import { helpAnswerText } from "./reply-presentation"
import { ScreenDestination, screenDestinationTitle } from "./screen-destinations"
import { pricePresentation } from "./price-presentation"
import { useVoiceInput } from "./use-voice-input"
import {
  CardTopUpAnswer,
  ContactActionAnswer,
  MerchantsAnswer,
} from "./quick-action-views"

// The Ask Flash thread (ENG-689, spec §7): the user's bubbles, the
// assistant's templated replies, the read tools' answers, the action cards,
// and a typing line while a turn runs. Every string comes from LL, as the
// send flow's confirmation screen reads it (const { LL } = useI18nContext()).
// Every figure comes from a tool's payload, formatted here by the app's own
// display-currency formatter, never from the model or the grammar. Cards
// render through ActionCardView, unchanged. Offline, a banner says so, and
// answers from the cache carry the stale label at their top. The on-device
// model reads what the grammar misses only while assistantEnabled and
// assistantOnDeviceModel are both on (ENG-690, architect decision 2), and
// the screen loads its session only for a genuine miss, under the same two flags
// (ENG-749), never at app launch.

// A development build's hook for the on-device model's device eval
// (engine/model-eval-hook.ts); a no-op in a release build.
registerModelEvalHook()

/** The label that says an answer came from the cache: at the top, in the error box's colors. */
const StaleBadge: React.FC<{ asOf?: number }> = ({ asOf }) => {
  const { LL } = useI18nContext()
  return (
    <View testID="ask-flash-stale" accessible accessibilityRole="alert">
      <GaloyErrorBox
        errorMessage={
          asOf
            ? LL.AskFlashHelp.savedAt({ time: new Date(asOf).toLocaleString() })
            : LL.AskFlash.staleBadge()
        }
      />
    </View>
  )
}

const Bubble: React.FC<{ from: "user" | "assistant"; text: string; testID: string }> = ({
  from,
  text,
  testID,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  return (
    <View
      style={[
        styles.bubble,
        from === "user" ? styles.userBubble : styles.assistantBubble,
      ]}
      testID={testID}
    >
      <Text type="p2" color={from === "user" ? colors.textInverse : undefined}>
        {text}
      </Text>
    </View>
  )
}

/** A read tool's answer: a title, the stale label when it came from the cache, its rows. */
const Answer: React.FC<
  React.PropsWithChildren<{
    title: string
    stale?: boolean
    asOf?: number
    testID: string
  }>
> = ({ title, stale = false, asOf, testID, children }) => {
  const styles = useStyles()
  return (
    <View style={styles.answer} testID={testID}>
      {stale ? <StaleBadge asOf={asOf} /> : null}
      <Text type="p1" bold accessibilityRole="header" style={styles.answerTitle}>
        {title}
      </Text>
      {children}
    </View>
  )
}

const AnswerRow: React.FC<{ label: string; value: string; testID?: string }> = ({
  label,
  value,
  testID,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}, ${value}`}
      testID={testID}
    >
      <Text type="p3" color={colors.grey1} style={styles.rowLabel}>
        {label}
      </Text>
      <Text type="p2" bold style={styles.rowValue}>
        {value}
      </Text>
    </View>
  )
}

const BalancesAnswer: React.FC<{
  payload: BalancesProjection
  stale: boolean
  asOf?: number
}> = ({ payload, stale, asOf }) => {
  const { LL } = useI18nContext()
  const { formatMoneyAmount } = useDisplayCurrency()
  const cashRows = payload.balances.filter(({ wallet }) => wallet !== "BTC").length
  return (
    <Answer
      title={LL.AskFlash.balancesTitle()}
      stale={stale}
      asOf={asOf}
      testID="ask-flash-balances"
    >
      {payload.balances.map((entry) => {
        const name =
          entry.wallet === "BTC" ? LL.HomeScreen.bitcoin() : LL.HomeScreen.cash()
        // An account cut over to USDT can hold its legacy USD wallet too.
        const label =
          entry.wallet !== "BTC" && cashRows > 1 ? `${name} (${entry.wallet})` : name
        const value =
          entry.state === "ok"
            ? formatMoneyAmount({ moneyAmount: entry.balance })
            : replyText(LL, entry.replyKey)
        return (
          <AnswerRow
            key={entry.wallet}
            label={label}
            value={value}
            testID={`ask-flash-balance-${entry.wallet}`}
          />
        )
      })}
    </Answer>
  )
}

/**
 * The app's own transaction row (TxItem, as home and the history screens
 * draw it) for a payment a history answer lists, from the payment as its
 * rail handed it to the tool: the memo, the pending state, the fee, the
 * amount in the display currency, the hidden balance, and a tap through to
 * the payment's details (spec §6: the txList card "renders existing tx
 * rows"). A BTC-wallet payment's display figures are the home list's own;
 * TxItem does not read them, so they are blank while there is no price yet.
 */
const AppTxRow: React.FC<{ listed: ListedTransaction; testID: string }> = ({
  listed,
  testID,
}) => {
  const { convertMoneyAmount } = usePriceConversion()
  const tx: UnifiedTransaction =
    listed.rail === "graphql"
      ? { source: "ibex", transaction: listed.transaction }
      : convertMoneyAmount
      ? formatBreezPayment({ payment: listed.payment, convertMoneyAmount })
      : { source: "breez", payment: listed.payment, displayAmount: "", displayFee: "" }
  return (
    <View testID={testID}>
      <TxItem tx={tx} />
    </View>
  )
}

const TransactionsAnswer: React.FC<{
  payload: TransactionsProjection
  listed: Readonly<Record<string, ListedTransaction>>
  stale: boolean
  asOf?: number
  actions: CardActions
}> = ({ payload, listed, stale, asOf, actions }) => {
  const { LL } = useI18nContext()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { formatMoneyAmount } = useDisplayCurrency()
  // One id per row across both rails, for the card's list.
  const ids = payload.transactions.map(({ rail, id }) => listedKey(rail, id))
  return (
    <View testID="ask-flash-transactions">
      {stale ? <StaleBadge asOf={asOf} /> : null}
      {stale ? <Text type="p3">{LL.AskFlashHelp.incompleteHistory()}</Text> : null}
      <ActionCardView
        payload={{
          type: "txList",
          txIds: ids,
          windowText: LL.Assistant.searchedWindow({
            count: payload.window.searchedCount,
          }),
        }}
        actions={actions}
        renderTransaction={(id) => {
          const row = listed[id]
          const projection = payload.transactions.find(
            (tx) => listedKey(tx.rail, tx.id) === id,
          )
          if (!row && projection)
            return (
              <AnswerRow
                label={`${new Date(projection.timestamp * 1000).toLocaleString()} · ${
                  projection.status === "SUCCESS"
                    ? LL.AskFlashHelp.success()
                    : projection.status === "PENDING"
                    ? LL.AskFlashHelp.pending()
                    : LL.AskFlashHelp.failure()
                }`}
                value={`${projection.direction === "SEND" ? "−" : "+"}${formatMoneyAmount(
                  { moneyAmount: projection.amount },
                )}`}
                testID={`ask-flash-saved-tx-${ids.indexOf(id)}`}
              />
            )
          return row ? (
            <AppTxRow listed={row} testID={`ask-flash-tx-${ids.indexOf(id)}`} />
          ) : null
        }}
      />
      {payload.btc.state === "ok" ? null : (
        <Text
          type="p3"
          color={colors.grey1}
          style={styles.note}
          testID="ask-flash-btc-state"
        >
          {replyText(LL, payload.btc.replyKey)}
        </Text>
      )}
    </View>
  )
}

const PriceAnswer: React.FC<{ payload: PricePayload }> = ({ payload }) => {
  const { LL } = useI18nContext()
  const { displayCurrency, formatMoneyAmount, formatCurrency } = useDisplayCurrency()
  const value = pricePresentation(payload, {
    displayCurrency,
    formatMoneyAmount,
    formatCurrency,
  })
  if (!value)
    return (
      <Bubble
        from="assistant"
        text={LL.Assistant.toolFailed()}
        testID="ask-flash-reply"
      />
    )
  // The title says what it is; the figure is one bitcoin's price.
  return (
    <Answer title={LL.common.bitcoinPrice()} testID="ask-flash-price">
      <Text type="h2" bold testID="ask-flash-price-value">
        {value}
      </Text>
    </Answer>
  )
}

const HelpAnswer: React.FC<{ topic: HelpTopic }> = ({ topic }) => {
  const { LL } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { isOffline } = useConnectivity()
  const styles = useStyles()
  const action = HELP_ACTIONS[topic]
  const text = helpAnswerText(LL, topic)
  const labels = {
    receive: LL.AskFlashHelp.receiveAction(),
    transfers: LL.AskFlashHelp.transfersAction(),
    backup: LL.AskFlashHelp.backupAction(),
    scan: LL.AskFlashHelp.scanAction(),
    history: LL.AskFlashHelp.historyAction(),
    support: LL.AskFlashHelp.supportChatAction(),
  }
  // Network-backed screens are not opened from offline help: opening them
  // could start their queries before the user has reconnected.
  const canOpen = action && (!isOffline || action === "support")
  const open = () => {
    switch (action) {
      case "receive":
        navigation.navigate("receiveBitcoin")
        break
      case "transfers":
        navigation.navigate("TopupCashout")
        break
      case "backup":
        navigation.navigate("BackupOptions")
        break
      case "scan":
        navigation.navigate("scanningQRCode")
        break
      case "history":
        navigation.navigate("transactionHistory")
        break
      case "support":
        // Rendered by SupportAction below so its hook only mounts for support.
        break
    }
  }
  return (
    <View style={styles.answer} testID={`ask-flash-help-${topic}`}>
      <Text type="p2">{text}</Text>
      {canOpen && action === "support" ? (
        <SupportAction />
      ) : canOpen && action ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={open}
          testID="ask-flash-help-action"
          style={styles.helpAction}
        >
          <Text type="p2" bold>
            {labels[action]}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const SupportAction: React.FC = () => {
  const { LL } = useI18nContext()
  const styles = useStyles()
  const openSupportChat = useOpenSupportChat()
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={openSupportChat}
      testID="ask-flash-help-action"
      style={styles.helpAction}
    >
      <Text type="p2" bold>
        {LL.AskFlashHelp.supportChatAction()}
      </Text>
    </TouchableOpacity>
  )
}

const ChatAction: React.FC = () => {
  const { LL } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { persistentState, updateState } = usePersistentStateContext()
  const [pending, setPending] = useState(false)
  const styles = useStyles()
  useEffect(() => {
    if (pending && persistentState.chatEnabled) {
      setPending(false)
      navigation.navigate("Primary", { screen: "Chat", params: { screen: "chatList" } })
    }
  }, [pending, persistentState.chatEnabled, navigation])
  const open = () => {
    if (persistentState.chatEnabled) {
      navigation.navigate("Primary", { screen: "Chat", params: { screen: "chatList" } })
    } else {
      setPending(true)
      updateState((state) => (state ? { ...state, chatEnabled: true } : undefined))
    }
  }
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={open}
      testID="ask-flash-screen-action"
      style={styles.helpAction}
    >
      <Text type="p2" bold>
        {LL.AskFlashHelp.screenAction({ screen: LL.ChatScreen.title() })}
      </Text>
    </TouchableOpacity>
  )
}

const ScreenAnswer: React.FC<{ destination: ScreenDestination }> = ({ destination }) => {
  const { LL } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()
  const title = screenDestinationTitle(LL, destination)
  const open = () => {
    switch (destination) {
      case "home":
        navigation.navigate("Primary", { screen: "Home" })
        break
      case "contacts":
        navigation.navigate("Contacts")
        break
      case "map":
        navigation.navigate("Primary", { screen: "Map" })
        break
      case "chat":
        break
      case "chatProfile":
        navigation.navigate("EditNostrProfile")
        break
      case "settings":
        navigation.navigate("settings")
        break
      case "account":
        navigation.navigate("accountScreen")
        break
      case "bankAccounts":
        navigation.navigate("BankAccounts")
        break
      case "transfers":
        navigation.navigate("TopupCashout")
        break
      case "receive":
        navigation.navigate("receiveBitcoin")
        break
      case "scanner":
        navigation.navigate("scanningQRCode")
        break
      case "history":
        navigation.navigate("transactionHistory")
        break
      case "card":
        navigation.navigate("Card")
        break
      case "invite":
        navigation.navigate("InviteFriend")
        break
      case "referrals":
        navigation.navigate("MyReferrals")
        break
      case "notifications":
        navigation.navigate("notificationSettingsScreen")
        break
      case "language":
        navigation.navigate("language")
        break
      case "currency":
        navigation.navigate("currency")
        break
      case "theme":
        navigation.navigate("theme")
        break
      case "backup":
        navigation.navigate("BackupOptions")
        break
      case "security":
        navigation.navigate("settings")
        break
      case "limits":
        navigation.navigate("transactionLimitsScreen")
        break
      case "defaultWallet":
        navigation.navigate("defaultWallet")
        break
      case "socialSettings":
        navigation.navigate("NostrSettingsScreen")
        break
      case "bitcoinPrice":
        navigation.navigate("priceHistory")
        break
      case "support":
        break
    }
  }
  return (
    <View style={styles.answer} testID={`ask-flash-screen-${destination}`}>
      <Text type="p2">
        {destination === "chat"
          ? LL.AskFlashHelp.chatSetupLocation()
          : destination === "security"
          ? LL.AskFlashHelp.settingsSectionLocation({ screen: title })
          : LL.AskFlashHelp.screenLocation({ screen: title })}
      </Text>
      {destination === "support" ? (
        <SupportAction />
      ) : destination === "chat" ? (
        <ChatAction />
      ) : (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={open}
          testID="ask-flash-screen-action"
          style={styles.helpAction}
        >
          <Text type="p2" bold>
            {LL.AskFlashHelp.screenAction({
              screen: destination === "security" ? LL.SettingsScreen.title() : title,
            })}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const AddressAnswer: React.FC<{ entry: Extract<ThreadEntry, { kind: "address" }> }> = ({
  entry,
}) => {
  const { LL } = useI18nContext()
  const styles = useStyles()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  return (
    <Answer title={LL.AskFlashHelp.addressTitle()} testID="ask-flash-address">
      {entry.state === "available" && entry.address ? (
        <>
          {entry.stale ? <Text type="p3">{LL.AskFlashHelp.addressSaved()}</Text> : null}
          <Text type="p1" selectable testID="ask-flash-address-value">
            {entry.address}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.helpAction}
            testID="ask-flash-address-copy"
            onPress={() => {
              if (!entry.address) return
              Clipboard.setString(entry.address)
              toastShow({
                type: "success",
                position: "top",
                currentTranslation: LL,
                message: (translations) =>
                  translations.GaloyAddressScreen.copiedLightningAddressToClipboard(),
              })
            }}
          >
            <Text type="p2" bold>
              {LL.AskFlashHelp.addressCopy()}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text type="p2">
            {entry.state === "notSet"
              ? LL.AskFlashHelp.addressNotSet()
              : entry.stale
              ? LL.AskFlashHelp.addressOfflineUnavailable()
              : LL.AskFlashHelp.addressUnavailable()}
          </Text>
          {entry.state === "notSet" && !entry.stale ? (
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.helpAction}
              onPress={() => navigation.navigate("UsernameSet", { insideApp: true })}
            >
              <Text type="p2" bold>
                {LL.AskFlashHelp.addressSetup()}
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </Answer>
  )
}

const EntryView: React.FC<{
  entry: ThreadEntry
  actions: CardActions
  onPick: (entryId: string, optionId: string) => void
}> = ({ entry, actions, onPick }) => {
  const { LL } = useI18nContext()
  const { displayCurrency } = useDisplayCurrency()
  const { formatMoneyAmount } = useDisplayCurrency()
  switch (entry.kind) {
    case "address":
      return <AddressAnswer entry={entry} />
    case "help":
      return <HelpAnswer topic={entry.topic} />
    case "screen":
      return <ScreenAnswer destination={entry.destination} />
    case "merchants":
      return <MerchantsAnswer payload={entry.payload} />
    case "contactAction":
      return <ContactActionAnswer entry={entry} />
    case "cardTopUp":
      return <CardTopUpAnswer entry={entry} />
    case "cashoutAmount":
      return (
        <Bubble
          from="assistant"
          text={LL.AskFlashActions.cashoutAmount({ currency: entry.displayCurrency })}
          testID="ask-flash-cashout-amount"
        />
      )
    case "conversionAmount":
      return (
        <Bubble
          from="assistant"
          text={LL.AskFlashHelp.conversionAmount({ from: entry.from, to: entry.to })}
          testID="ask-flash-conversion-amount"
        />
      )
    case "details":
      return (
        <Answer
          title={LL.AskFlashHelp.detailsTitle()}
          stale={entry.stale}
          asOf={entry.asOf}
          testID="ask-flash-details"
        >
          <AnswerRow
            label={LL.AskFlashHelp.status()}
            value={
              entry.payload.status === "SUCCESS"
                ? LL.AskFlashHelp.success()
                : entry.payload.status === "PENDING"
                ? LL.AskFlashHelp.pending()
                : entry.payload.status === "FAILURE"
                ? LL.AskFlashHelp.failure()
                : LL.AskFlashHelp.unknown()
            }
          />
        </Answer>
      )
    case "limits":
      return (
        <Answer
          title={LL.AskFlashHelp.limitsTitle()}
          stale={entry.stale}
          asOf={entry.asOf}
          testID="ask-flash-limits"
        >
          {(["withdrawal", "internalSend", "convert"] as const).map((kind) => (
            <View key={kind}>
              <Text type="p2" bold>
                {LL.AskFlashHelp[kind]()}
              </Text>
              {entry.payload[kind].length === 0 ? (
                <Text type="p3">{LL.AskFlashHelp.notReported()}</Text>
              ) : null}
              {entry.payload[kind].map((limit, index) => (
                <View key={index}>
                  <AnswerRow
                    label={LL.AskFlashHelp.limitTotal()}
                    value={formatMoneyAmount({ moneyAmount: limit.total })}
                  />
                  <AnswerRow
                    label={LL.AskFlashHelp.limitRemaining()}
                    value={
                      limit.remaining
                        ? formatMoneyAmount({ moneyAmount: limit.remaining })
                        : LL.AskFlashHelp.notReported()
                    }
                  />
                  <AnswerRow
                    label={LL.AskFlashHelp.limitInterval()}
                    value={
                      limit.intervalSeconds === null
                        ? LL.AskFlashHelp.notReported()
                        : String(limit.intervalSeconds)
                    }
                  />
                </View>
              ))}
            </View>
          ))}
        </Answer>
      )
    case "user":
      return <Bubble from="user" text={entry.text} testID="ask-flash-user-bubble" />
    case "reply":
      return (
        <Bubble
          from="assistant"
          text={
            // The amount question's example is a code this account reads.
            entry.replyKey === "Assistant.amountUnclear"
              ? LL.Assistant.amountUnclear({
                  currency: entry.params?.currency ?? displayCurrency,
                })
              : replyText(LL, entry.replyKey)
          }
          testID="ask-flash-reply"
        />
      )
    case "balances":
      return (
        <BalancesAnswer payload={entry.payload} stale={entry.stale} asOf={entry.asOf} />
      )
    case "transactions":
      return (
        <TransactionsAnswer
          payload={entry.payload}
          listed={entry.listed ?? {}}
          stale={entry.stale}
          asOf={entry.asOf}
          actions={actions}
        />
      )
    case "price":
      return <PriceAnswer payload={entry.payload} />
    case "card":
      return (
        <ActionCardView
          payload={entry.card}
          actions={actions}
          onPick={(optionId) => onPick(entry.id, optionId)}
        />
      )
  }
}

export const AskFlashScreen: React.FC = () => {
  const client = useApolloClient()
  const { LL, locale } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { isOffline } = useConnectivity()
  const { appConfig } = useAppConfig()
  const {
    assistantEnabled,
    assistantOnDeviceModel,
    assistantVoice,
    assistantVoiceReplies,
  } = useFeatureFlags()
  const {
    displayCurrency,
    fiatSymbol,
    fractionDigits,
    formatMoneyAmount,
    formatDisplayAndWalletAmount,
    formatCurrency,
  } = useDisplayCurrency()
  const insets = useSafeAreaInsets()
  const composerPadding = useKeyboardPaddingStyle(insets.bottom)
  const list = useRef<FlatList<ThreadEntry>>(null)
  const [text, setText] = useState("")

  const runtime = getAssistantRuntime(client, {
    authDescription: LL.AuthenticationScreen.authenticationDescription(),
    cacheScope: appConfig.token
      ? sha256(`${appConfig.galoyInstance.graphqlUri}\n${appConfig.token}`)
      : undefined,
  })
  const suggestions = useSyncExternalStore(
    runtime.suggestions.subscribe,
    runtime.suggestions.get,
  )
  const onDeviceModel = assistantEnabled && assistantOnDeviceModel
  const env: TurnEnv = {
    isOffline,
    displayCurrency,
    displaySymbol: fiatSymbol,
    display: { formatMoneyAmount, formatDisplayAndWalletAmount, fractionDigits },
    graphqlUri: appConfig.galoyInstance.graphqlUri,
    lnAddressHostname: appConfig.galoyInstance.lnAddressHostname,
    onDeviceModel,
  }

  const [showSpeechSettings, setShowSpeechSettings] = useState(false)
  const previewLocale =
    LL.AskFlashSpeech.previewText() === i18nObject("en").AskFlashSpeech.previewText()
      ? "en-US"
      : locale
  const speechEnabled = assistantEnabled && assistantVoiceReplies
  const spokenReplies = useSyncExternalStore(
    runtime.speechPreference.subscribe,
    runtime.speechPreference.get,
  )
  const speechDisplay = { displayCurrency, formatMoneyAmount, formatCurrency }
  const speech = useSpeechOutput({
    enabled: speechEnabled,
    runtime,
    LL,
    locale,
    display: speechDisplay,
  })
  const stopSpeech = speech.stop
  const thread = useThread(runtime, env)
  useLayoutEffect(() => {
    navigation.setOptions?.({
      headerRight: speechEnabled
        ? () => (
            <TouchableOpacity
              accessibilityRole="button"
              testID="ask-flash-spoken-replies"
              accessibilityLabel={LL.AskFlashSpeech.preference()}
              style={styles.speechSetting}
              onPress={() => {
                stopSpeech().catch(() => undefined)
                setShowSpeechSettings(true)
              }}
            >
              <Icon
                type="ionicon"
                name={spokenReplies ? "volume-high-outline" : "volume-mute-outline"}
                size={24}
              />
              <Text type="p3">{LL.AskFlashSpeech.voice()}</Text>
            </TouchableOpacity>
          )
        : undefined,
    })
    return () => {
      navigation.setOptions?.({ headerRight: undefined })
    }
  }, [
    navigation,
    speechEnabled,
    spokenReplies,
    runtime,
    LL,
    styles.speechSetting,
    stopSpeech,
  ])
  const voiceEnabled = assistantEnabled && assistantVoice
  const submitUtterance = (utterance: string, origin: "text" | "voice") => {
    if (runtime.transcript.get().busy || !utterance.trim()) return false
    speech.stop().catch(() => undefined)
    setText("")
    thread.submit(utterance, origin)
    return true
  }
  const voice = useVoiceInput({
    enabled: voiceEnabled,
    busy: thread.busy,
    beforeCapture: speech.stop,
    onSubmit: (utterance) => submitUtterance(utterance, "voice"),
  })
  const canSend = !thread.busy && !voice.active && text.trim().length > 0
  const talkDisabled = !voice.available || thread.busy || voice.phase === "finalizing"
  const talkLabel = voice.showFinishing
    ? LL.AskFlash.finishing()
    : voice.phase === "requesting-permission" ||
      voice.phase === "listening" ||
      voice.phase === "finalizing"
    ? LL.AskFlash.releaseToSend()
    : LL.AskFlash.holdToTalk()
  const voiceMessage =
    voice.problem === "permission"
      ? LL.AskFlash.voicePermission()
      : voice.problem === "failed"
      ? LL.AskFlash.voiceFailed()
      : voice.available === false
      ? LL.AskFlash.voiceUnavailable()
      : undefined
  useEffect(() => {
    if (voiceEnabled && voice.phase === "listening") {
      AccessibilityInfo.announceForAccessibility(LL.AskFlash.listening())
    }
  }, [voice.phase, voiceEnabled, LL])
  const accessibleTalk = () => {
    if (voice.active) voice.release()
    else if (!talkDisabled) voice.start()
  }

  const send = () => {
    if (!canSend) return
    submitUtterance(text, "text")
  }

  return (
    <Screen preset="fixed" keyboardOffset="navigationHeader">
      {speechEnabled && showSpeechSettings ? (
        <SpeechSettings
          preference={runtime.speechPreference}
          locale={previewLocale}
          LL={LL}
          problem={speech.problem}
          onChange={() => {
            speech.stop().catch(() => undefined)
          }}
          onClose={() => {
            speech.stop().catch(() => undefined)
            setShowSpeechSettings(false)
          }}
          previewing={speech.entryId === "voice-preview"}
          onPreview={(restart) =>
            !restart && speech.entryId === "voice-preview"
              ? speech.stop().catch(() => undefined)
              : speech.play(
                  { id: "voice-preview", kind: "help", topic: "capabilities" },
                  false,
                  {
                    text: LL.AskFlashSpeech.previewText(),
                    locale: previewLocale,
                    automatic: false,
                  },
                )
          }
        />
      ) : null}
      <View style={styles.container} testID="ask-flash-screen">
        {isOffline ? (
          <View style={styles.banner} testID="ask-flash-offline">
            <GaloyErrorBox errorMessage={LL.AskFlash.offlineBanner()} />
          </View>
        ) : null}
        {speechEnabled && speech.problem ? (
          <View style={styles.banner} testID="ask-flash-speech-problem">
            <Text type="p3" accessibilityRole="alert">
              {speech.problem === "unavailable"
                ? LL.AskFlashSpeech.unavailable()
                : LL.AskFlashSpeech.failed()}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.helpAction}
              onPress={() =>
                Alert.alert(
                  LL.AskFlashSpeech.setupTitle(),
                  LL.AskFlashSpeech.setupInstructions(),
                )
              }
            >
              <Text type="p3">{LL.AskFlashSpeech.setupTitle()}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <FlatList
          ref={list}
          data={thread.entries}
          keyExtractor={(entry) => entry.id}
          renderItem={({ item }) => {
            const spoken = speechEnabled
              ? spokenReplyFor(item, { LL, locale, display: speechDisplay })
              : undefined
            return (
              <View>
                <EntryView
                  entry={item}
                  actions={thread.cardActions}
                  onPick={thread.pick}
                />
                {spoken ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={
                      speech.entryId === item.id
                        ? LL.AskFlashSpeech.stop()
                        : LL.AskFlashSpeech.listen()
                    }
                    disabled={voice.active || thread.busy}
                    accessibilityState={{
                      disabled: voice.active || thread.busy,
                      busy: speech.entryId === item.id && speech.preparing,
                    }}
                    testID={`ask-flash-listen-${item.id}`}
                    style={styles.listenButton}
                    onPress={() => {
                      if (speech.entryId === item.id) speech.stop().catch(() => undefined)
                      else speech.play(item)
                    }}
                  >
                    <Icon
                      type="ionicon"
                      name={
                        speech.entryId === item.id
                          ? "stop-outline"
                          : "volume-high-outline"
                      }
                      size={18}
                    />
                    <Text type="p3">
                      {speech.entryId === item.id
                        ? LL.AskFlashSpeech.stop()
                        : LL.AskFlashSpeech.listen()}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )
          }}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <Text
              type="p2"
              color={colors.grey1}
              style={styles.empty}
              testID="ask-flash-empty"
            >
              {LL.AskFlash.emptyHint()}
            </Text>
          }
          ListFooterComponent={
            <View>
              {thread.busy ? (
                <Text
                  type="p3"
                  color={colors.grey1}
                  style={styles.typing}
                  accessibilityLiveRegion="polite"
                  testID="ask-flash-typing"
                >
                  {LL.AskFlash.typing()}
                </Text>
              ) : null}
              <View style={styles.suggestions} testID="ask-flash-suggestions">
                {suggestions.map((suggestion, index) => (
                  <TouchableOpacity
                    key={index}
                    accessibilityRole="button"
                    accessibilityLabel={LL.AskFlashHelp[suggestion.questionKey]()}
                    accessibilityState={{ disabled: thread.busy || voice.active }}
                    disabled={thread.busy || voice.active}
                    testID={`ask-flash-example-${index}`}
                    style={[
                      styles.suggestion,
                      (thread.busy || voice.active) && styles.sendDisabled,
                    ]}
                    onPress={() => {
                      if (submitUtterance(suggestion.question, "text"))
                        runtime.suggestions.choose(suggestion.id)
                    }}
                  >
                    <Text type="p3">{LL.AskFlashHelp[suggestion.labelKey]()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          testID="ask-flash-list"
        />
        <Animated.View style={composerPadding}>
          <View style={styles.composer}>
            <TextInput
              style={[styles.input, { color: colors.black }]}
              value={voice.active ? voice.preview : text}
              onChangeText={(value) => {
                if (!voice.active) setText(value)
              }}
              placeholder={
                voice.phase === "listening"
                  ? LL.AskFlash.listening()
                  : LL.AskFlash.placeholder()
              }
              placeholderTextColor={colors.grey3}
              editable={!thread.busy && !voice.active}
              returnKeyType="send"
              onSubmitEditing={send}
              accessibilityLabel={LL.AskFlash.placeholder()}
              testID="ask-flash-input"
            />
            <TouchableOpacity
              style={[styles.sendButton, !canSend && styles.sendDisabled]}
              onPress={send}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel={LL.AskFlash.send()}
              accessibilityState={{ disabled: !canSend, busy: thread.busy }}
              testID="ask-flash-send"
            >
              <Text type="p2" bold color={colors.textInverse}>
                {LL.AskFlash.send()}
              </Text>
            </TouchableOpacity>
          </View>
          {voiceEnabled ? (
            <View style={styles.voiceArea}>
              {voiceMessage ? (
                <View accessibilityLiveRegion="polite" testID="ask-flash-voice-message">
                  <Text type="p3" style={styles.voiceMessage}>
                    {voiceMessage}
                  </Text>
                  {voice.problem === "permission" ? (
                    <TouchableOpacity
                      onPress={() => {
                        Linking.openSettings().catch(() => undefined)
                      }}
                      accessibilityRole="button"
                      testID="ask-flash-voice-settings"
                      style={styles.voiceSettings}
                    >
                      <Text type="p3">{LL.AskFlash.voiceSettings()}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              <View
                style={[
                  styles.talkButton,
                  talkDisabled && styles.sendDisabled,
                  voice.phase === "listening" && styles.talkListening,
                ]}
                accessible
                accessibilityRole="button"
                accessibilityLabel={
                  voice.phase === "listening"
                    ? LL.AskFlash.stopVoice()
                    : voice.available === false
                    ? LL.AskFlash.voiceUnavailable()
                    : LL.AskFlash.holdToTalk()
                }
                accessibilityHint={LL.AskFlash.voiceAccessibilityHint()}
                accessibilityState={{
                  disabled: talkDisabled,
                  busy: voice.phase === "finalizing",
                }}
                accessibilityActions={[
                  {
                    name: "activate",
                    label: voice.active
                      ? LL.AskFlash.stopVoice()
                      : LL.AskFlash.startVoice(),
                  },
                ]}
                onAccessibilityAction={accessibleTalk}
                onAccessibilityTap={accessibleTalk}
                onStartShouldSetResponder={() => !talkDisabled}
                onResponderGrant={() => {
                  voice.start()
                }}
                onResponderRelease={voice.release}
                onResponderTerminate={voice.cancel}
                onResponderTerminationRequest={() => false}
                testID="ask-flash-talk"
              >
                <Icon
                  name="mic-outline"
                  type="ionicon"
                  size={28}
                  color={colors.textInverse}
                />
                <View style={styles.talkText}>
                  <Text
                    type="p2"
                    bold
                    style={styles.talkMeasure}
                    accessible={false}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    {LL.AskFlash.releaseToSend()}
                  </Text>
                  <Text
                    type="p2"
                    bold
                    color={colors.textInverse}
                    style={styles.talkLabel}
                  >
                    {talkLabel}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
  },
  banner: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  empty: {
    textAlign: "center",
    marginTop: 32,
  },
  bubble: {
    maxWidth: "85%",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginVertical: 4,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.button01,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.grey5,
  },
  answer: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    backgroundColor: colors.grey5,
  },
  helpAction: { minHeight: 48, justifyContent: "center" },
  speechSetting: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 8,
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  listenButton: {
    minHeight: 48,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 12 },
  suggestion: {
    minHeight: 48,
    maxWidth: "100%",
    justifyContent: "center",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.grey5,
  },
  answerTitle: {
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  rowLabel: {
    flexShrink: 1,
    marginRight: 12,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: "right",
  },
  note: {
    marginTop: 4,
  },
  typing: {
    marginVertical: 8,
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.grey4,
  },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: colors.grey5,
    marginRight: 8,
  },
  sendButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    justifyContent: "center",
    backgroundColor: colors.button01,
  },
  voiceArea: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  talkButton: {
    minHeight: 80,
    alignSelf: "stretch",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.button01,
    borderWidth: 2,
    borderColor: colors.button01,
  },
  talkListening: { borderColor: colors.black },
  talkText: { marginLeft: 12, flexShrink: 1 },
  // Reserve the longest label so enlarged text cannot move the held button.
  talkMeasure: { opacity: 0, textAlign: "center" },
  talkLabel: { position: "absolute", top: 0, left: 0, right: 0, textAlign: "center" },
  voiceMessage: { marginBottom: 8, textAlign: "center" },
  voiceSettings: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  sendDisabled: {
    opacity: 0.4,
  },
}))
