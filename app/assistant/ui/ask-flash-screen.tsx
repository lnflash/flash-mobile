import React, { useRef, useState } from "react"
import { FlatList, TextInput, TouchableOpacity, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useApolloClient } from "@apollo/client"
import { makeStyles, Text, useTheme } from "@rneui/themed"

import { GaloyErrorBox } from "@app/components/atomic/galoy-error-box"
import { Screen } from "@app/components/screen"
import { TxItem } from "@app/components/transaction-item"
import { useFeatureFlags } from "@app/config/feature-flags-context"
import { WalletCurrency } from "@app/graphql/generated"
import { useAppConfig } from "@app/hooks/use-app-config"
import { useConnectivity } from "@app/hooks/use-connectivity"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { Animated, useKeyboardPaddingStyle } from "@app/hooks/use-keyboard-padding"
import { SATS_PER_BTC, usePriceConversion } from "@app/hooks/use-price-conversion"
import { useI18nContext } from "@app/i18n/i18n-react"
import { toDisplayAmount, toUsdMoneyAmount } from "@app/types/amounts"
import type { UnifiedTransaction } from "@app/types/transactions"
import { priceOfCurrencyInCurrencyFor } from "@app/utils/price-conversion"
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
import { getAssistantRuntime } from "./assistant-runtime"
import { ListedTransaction, listedKey, ThreadEntry } from "./thread-store"
import type { TurnEnv } from "./turn"
import { useThread } from "./use-thread"

// The Ask Flash thread (ENG-689, spec §7): the user's bubbles, the
// assistant's templated replies, the read tools' answers, the action cards,
// and a typing line while a turn runs. Every string comes from LL, as the
// send flow's confirmation screen reads it (const { LL } = useI18nContext()).
// Every figure comes from a tool's payload, formatted here by the app's own
// display-currency formatter, never from the model or the grammar. Cards
// render through ActionCardView, unchanged. Offline, a banner says so, and
// answers from the cache carry the stale label at their top. The on-device
// model reads what the grammar misses only while assistantEnabled and
// assistantOnDeviceModel are both on (ENG-690, architect decision 2).

// A development build's hook for the on-device model's device eval
// (engine/model-eval-hook.ts); a no-op in a release build.
registerModelEvalHook()

/** The label that says an answer came from the cache: at the top, in the error box's colors. */
const StaleBadge: React.FC = () => {
  const { LL } = useI18nContext()
  return (
    <View testID="ask-flash-stale" accessible accessibilityRole="alert">
      <GaloyErrorBox errorMessage={LL.AskFlash.staleBadge()} />
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
  React.PropsWithChildren<{ title: string; stale?: boolean; testID: string }>
> = ({ title, stale = false, testID, children }) => {
  const styles = useStyles()
  return (
    <View style={styles.answer} testID={testID}>
      {stale ? <StaleBadge /> : null}
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

const BalancesAnswer: React.FC<{ payload: BalancesProjection; stale: boolean }> = ({
  payload,
  stale,
}) => {
  const { LL } = useI18nContext()
  const { formatMoneyAmount } = useDisplayCurrency()
  const cashRows = payload.balances.filter(({ wallet }) => wallet !== "BTC").length
  return (
    <Answer title={LL.AskFlash.balancesTitle()} stale={stale} testID="ask-flash-balances">
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
  actions: CardActions
}> = ({ payload, listed, stale, actions }) => {
  const { LL } = useI18nContext()
  const styles = useStyles()
  const { colors } = useTheme().theme
  // One id per row across both rails, for the card's list.
  const ids = payload.transactions.map(({ rail, id }) => listedKey(rail, id))
  return (
    <View testID="ask-flash-transactions">
      {stale ? <StaleBadge /> : null}
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
  const table = priceOfCurrencyInCurrencyFor(payload)
  if (!table)
    return (
      <Bubble
        from="assistant"
        text={LL.Assistant.toolFailed()}
        testID="ask-flash-reply"
      />
    )
  // One bitcoin, in minor units of the currency the price came in, by the
  // screens' own conversion (app/utils/price-conversion.ts).
  const perBitcoin = table(WalletCurrency.Btc, "DisplayCurrency") * SATS_PER_BTC
  const value =
    payload.currency === displayCurrency
      ? formatMoneyAmount({
          moneyAmount: toDisplayAmount({
            amount: perBitcoin,
            currencyCode: payload.currency,
          }),
        })
      : payload.currency === WalletCurrency.Usd
      ? formatMoneyAmount({ moneyAmount: toUsdMoneyAmount(perBitcoin) })
      : formatCurrency({
          amountInMajorUnits: perBitcoin / 100,
          currency: payload.currency,
        })
  // The title says what it is; the figure is one bitcoin's price.
  return (
    <Answer title={LL.common.bitcoinPrice()} testID="ask-flash-price">
      <Text type="h2" bold testID="ask-flash-price-value">
        {value}
      </Text>
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
  switch (entry.kind) {
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
      return <BalancesAnswer payload={entry.payload} stale={entry.stale} />
    case "transactions":
      return (
        <TransactionsAnswer
          payload={entry.payload}
          listed={entry.listed ?? {}}
          stale={entry.stale}
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
  const { LL } = useI18nContext()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { isOffline } = useConnectivity()
  const { appConfig } = useAppConfig()
  const { assistantEnabled, assistantOnDeviceModel } = useFeatureFlags()
  const {
    displayCurrency,
    fiatSymbol,
    fractionDigits,
    formatMoneyAmount,
    formatDisplayAndWalletAmount,
  } = useDisplayCurrency()
  const insets = useSafeAreaInsets()
  const composerPadding = useKeyboardPaddingStyle(insets.bottom)
  const list = useRef<FlatList<ThreadEntry>>(null)
  const [text, setText] = useState("")

  const runtime = getAssistantRuntime(client, {
    authDescription: LL.AuthenticationScreen.authenticationDescription(),
  })
  const env: TurnEnv = {
    isOffline,
    displayCurrency,
    displaySymbol: fiatSymbol,
    display: { formatMoneyAmount, formatDisplayAndWalletAmount, fractionDigits },
    graphqlUri: appConfig.galoyInstance.graphqlUri,
    lnAddressHostname: appConfig.galoyInstance.lnAddressHostname,
    onDeviceModel: assistantEnabled && assistantOnDeviceModel,
  }
  const thread = useThread(runtime, env)
  const canSend = !thread.busy && text.trim().length > 0

  const send = () => {
    if (!canSend) return
    const utterance = text
    setText("")
    thread.submit(utterance)
  }

  return (
    <Screen preset="fixed" keyboardOffset="navigationHeader">
      <View style={styles.container} testID="ask-flash-screen">
        {isOffline ? (
          <View style={styles.banner} testID="ask-flash-offline">
            <GaloyErrorBox errorMessage={LL.AskFlash.offlineBanner()} />
          </View>
        ) : null}
        <FlatList
          ref={list}
          data={thread.entries}
          keyExtractor={(entry) => entry.id}
          renderItem={({ item }) => (
            <EntryView entry={item} actions={thread.cardActions} onPick={thread.pick} />
          )}
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
            thread.busy ? (
              <Text
                type="p3"
                color={colors.grey1}
                style={styles.typing}
                accessibilityLiveRegion="polite"
                testID="ask-flash-typing"
              >
                {LL.AskFlash.typing()}
              </Text>
            ) : null
          }
          testID="ask-flash-list"
        />
        <Animated.View style={composerPadding}>
          <View style={styles.composer}>
            <TextInput
              style={[styles.input, { color: colors.black }]}
              value={text}
              onChangeText={setText}
              placeholder={LL.AskFlash.placeholder()}
              placeholderTextColor={colors.grey3}
              editable={!thread.busy}
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
  sendDisabled: {
    opacity: 0.4,
  },
}))
