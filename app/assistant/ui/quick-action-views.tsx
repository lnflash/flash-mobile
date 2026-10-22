import { useApolloClient } from "@apollo/client"
import React, { useEffect, useRef, useState } from "react"
import { Alert, TextInput, TouchableOpacity, View } from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import { makeStyles, Text } from "@rneui/themed"
import { nip05 } from "nostr-tools"

import { useConnectivity } from "@app/hooks/use-connectivity"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useFlashcard } from "@app/hooks/useFlashcard"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useOpenSupportChat } from "@app/hooks/use-open-support-chat"
import type { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useChatContext } from "@app/screens/chat/chatContext"
import { getSigner } from "@app/nostr/signer"
import { fetchNostrUsers } from "@app/utils/nostr"
import { pool } from "@app/utils/nostr/pool"
import { saveJson } from "@app/utils/storage"
import type { MerchantsPayload } from "../registry/projections"
import type { ThreadEntry } from "./thread-store"
import { parseAmount, parseDisplayAmount } from "../engine/parse-amount"
import { contactTagsFor } from "./contact-tags"
import { searchFlashUsernames } from "../rails/username-search"
import { lookupFlashUsername } from "../registry/read/lookup-flash-username"

const useStyles = makeStyles(({ colors }) => ({
  card: {
    backgroundColor: colors.grey5,
    borderRadius: 16,
    padding: 16,
    marginVertical: 6,
  },
  row: { paddingVertical: 7 },
  button: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: colors.primary,
    marginTop: 12,
  },
  buttonText: { color: colors.white },
  correction: { flexDirection: "row", gap: 8, marginTop: 12 },
  usernameInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.grey3,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: colors.black,
    fontSize: 16,
  },
  searchButton: { marginTop: 0, paddingHorizontal: 16 },
  disabled: { opacity: 0.45 },
  supportButton: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  supportText: { color: colors.primary },
}))

export const MerchantsAnswer: React.FC<{ payload: MerchantsPayload }> = ({ payload }) => {
  const { LL } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()
  return (
    <View style={styles.card} testID="ask-flash-merchants">
      <Text type="p1" bold>
        {LL.AskFlashActions.merchantsTitle()}
      </Text>
      {payload.merchants.length ? (
        payload.merchants.map((merchant, index) => (
          <Text type="p2" style={styles.row} key={`${merchant.title}:${index}`}>
            {merchant.title}
            {merchant.username ? ` · @${merchant.username}` : ""}
          </Text>
        ))
      ) : (
        <Text type="p2">{LL.AskFlashActions.noMerchants()}</Text>
      )}
      {payload.matchedCount > payload.merchants.length ? (
        <Text type="p3">{LL.AskFlashActions.moreMerchants()}</Text>
      ) : null}
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.button}
        onPress={() => navigation.navigate("Map")}
        testID="ask-flash-open-map"
      >
        <Text type="p2" bold style={styles.buttonText}>
          {LL.AskFlashActions.openMap()}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

export const CardTopUpAnswer: React.FC<{
  entry: Extract<ThreadEntry, { kind: "cardTopUp" }>
}> = ({ entry }) => {
  const { LL } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()
  const { isOffline } = useConnectivity()
  const { fractionDigits } = useDisplayCurrency()
  const { cashuCard } = useFlashcard()
  const parsed = entry.amount
    ? entry.currency
      ? parseAmount(entry.amount, entry.currency)
      : parseDisplayAmount(entry.amount, fractionDigits, entry.displayCurrency)
    : undefined
  const suggestedAmount =
    parsed?.ok && parsed.amount.amount > 0 ? parsed.amount : undefined
  return (
    <View style={styles.card} testID="ask-flash-card-topup">
      <Text type="p2">
        {entry.amount
          ? LL.AskFlashActions.cardTopUpAmount({
              amount: entry.amount,
              currency: entry.currency ?? entry.displayCurrency,
            })
          : LL.AskFlashActions.cardTopUpPrompt()}
      </Text>
      {entry.amount && !suggestedAmount ? (
        <Text type="p2">{LL.Assistant.invalidArguments()}</Text>
      ) : null}
      <TouchableOpacity
        accessibilityRole="button"
        disabled={isOffline || Boolean(entry.amount && !suggestedAmount)}
        style={styles.button}
        onPress={() =>
          cashuCard
            ? navigation.navigate(
                "FlashcardV2TopUp",
                suggestedAmount ? { suggestedAmount } : undefined,
              )
            : navigation.navigate("Card")
        }
        testID="ask-flash-open-card-topup"
      >
        <Text type="p2" bold style={styles.buttonText}>
          {LL.AskFlashActions.openCardTopUp()}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.snort.social",
]

export const ContactActionAnswer: React.FC<{
  entry: Extract<ThreadEntry, { kind: "contactAction" }>
  knownUsernames: readonly string[]
  onResolved: (entryId: string, username?: string) => void
}> = ({ entry, knownUsernames, onResolved }) => {
  const { LL } = useI18nContext()
  const styles = useStyles()
  const { isOffline } = useConnectivity()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const openSupport = useOpenSupportChat()
  const client = useApolloClient()
  const { contactsEvent, setContactsEvent, userPublicKey, addEventToProfiles } =
    useChatContext()
  const addProfileRef = useRef(addEventToProfiles)
  addProfileRef.current = addEventToProfiles
  const [pubkey, setPubkey] = useState<string>()
  const [username, setUsername] = useState(entry.username)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [draft, setDraft] = useState(entry.username)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<
    "loading" | "missing" | "ready" | "working" | "done" | "error"
  >("loading")
  const handle = `${username}@${entry.hostname}`
  const verifiedHandle = useRef<string>()
  const remember = useRef(onResolved)
  remember.current = onResolved
  useEffect(() => {
    // Newly loaded contact names can improve a miss, but must not reset a finished action.
    if (verifiedHandle.current === handle) return
    if (isOffline) return
    let live = true
    setPubkey(undefined)
    setSuggestions([])
    setState("loading")
    remember.current(entry.id, undefined)
    lookupFlashUsername(username, knownUsernames, {
      search: (hint) => searchFlashUsernames(client, hint),
      verify: async (name) => {
        const found = await nip05.queryProfile(`${name}@${entry.hostname}`.toLowerCase())
        return found?.pubkey && /^[0-9a-f]{64}$/i.test(found.pubkey) ? found.pubkey : null
      },
    })
      .then((result) => {
        if (!live) return
        if (result.kind === "exact") {
          verifiedHandle.current = handle
          remember.current(entry.id, result.match.username)
          setPubkey(result.match.value)
          setState("ready")
          fetchNostrUsers([result.match.value], (event, closer) => {
            if (live) addProfileRef.current(event)
            closer.close()
          })
        } else {
          setSuggestions(result.matches.map((match) => match.username))
          setState("missing")
        }
      })
      .catch(() => {
        if (live) setState("error")
      })
    return () => {
      live = false
    }
  }, [
    handle,
    username,
    entry.id,
    entry.hostname,
    knownUsernames,
    attempt,
    client,
    isOffline,
  ])
  const search = () => {
    const name = draft.trim().replace(/^@/, "").toLowerCase()
    if (!name || isOffline) return
    verifiedHandle.current = undefined
    setState("loading")
    setDraft(name)
    setUsername(name)
    setAttempt((value) => value + 1)
  }
  const saved = Boolean(
    pubkey && contactsEvent?.tags.some((tag) => tag[0] === "p" && tag[1] === pubkey),
  )
  const change = async () => {
    if (
      !pubkey ||
      !contactsEvent ||
      !userPublicKey ||
      contactsEvent.pubkey !== userPublicKey ||
      isOffline ||
      state !== "ready" ||
      entry.operation === "profile"
    )
      return
    setState("working")
    try {
      const signer = await getSigner()
      if ((await signer.getPublicKey()) !== userPublicKey)
        throw new Error("Chat account changed")
      const tags = contactTagsFor(contactsEvent.tags, entry.operation, pubkey)
      const event = await signer.signEvent({
        kind: 3,
        content: contactsEvent.content,
        // Nostr protocol field.
        // eslint-disable-next-line camelcase
        created_at: Math.max(Math.floor(Date.now() / 1000), contactsEvent.created_at + 1),
        tags,
      })
      const published = await Promise.allSettled(pool.publish(RELAYS, event))
      if (!published.some((result) => result.status === "fulfilled"))
        throw new Error("No relay accepted contact update")
      await saveJson(`contacts_event:${userPublicKey}`, event)
      setContactsEvent(event)
      setState("done")
    } catch {
      setState("error")
    }
  }
  const confirmRemove = () =>
    Alert.alert(
      LL.AskFlashActions.removeContactTitle({ username }),
      LL.AskFlashActions.removeContactBody(),
      [
        { text: LL.common.cancel(), style: "cancel" },
        {
          text: LL.AskFlashActions.removeContact(),
          style: "destructive",
          onPress: change,
        },
      ],
    )
  const label =
    entry.operation === "profile"
      ? LL.AskFlashActions.openProfile()
      : entry.operation === "add"
      ? LL.AskFlashActions.addContact()
      : LL.AskFlashActions.removeContact()
  const unavailable =
    state === "loading"
      ? LL.AskFlashActions.findingContact()
      : isOffline && entry.operation !== "profile"
      ? LL.Assistant.actionsOffline()
      : state === "missing"
      ? suggestions.length
        ? LL.Assistant.pickContact()
        : LL.AskFlashActions.contactNotFound()
      : state === "error"
      ? LL.AskFlashActions.contactError()
      : state === "done"
      ? LL.AskFlashActions.contactUpdated()
      : (!contactsEvent || !userPublicKey) && entry.operation !== "profile"
      ? LL.AskFlashActions.contactsLoading()
      : entry.operation === "add" && saved
      ? LL.AskFlashActions.alreadyContact()
      : entry.operation === "remove" && !saved
      ? LL.AskFlashActions.notContact()
      : undefined
  const available =
    state === "ready" &&
    pubkey &&
    (entry.operation === "profile" ||
      (!isOffline &&
        contactsEvent &&
        userPublicKey &&
        contactsEvent.pubkey === userPublicKey &&
        (entry.operation === "add" ? !saved : saved)))
  return (
    <View style={styles.card} testID={`ask-flash-contact-${entry.operation}`}>
      <Text type="p1" bold>
        @{username}
      </Text>
      {pubkey ? (
        <Text type="p2">{LL.AskFlashActions.verifiedProfile({ handle })}</Text>
      ) : null}
      {unavailable ? <Text type="p2">{unavailable}</Text> : null}
      {suggestions.map((name) => (
        <TouchableOpacity
          key={name}
          accessibilityRole="button"
          style={styles.button}
          testID="ask-flash-contact-suggestion"
          onPress={() => {
            setPubkey(undefined)
            setState("loading")
            setUsername(name)
            setDraft(name)
          }}
        >
          <Text type="p2" bold style={styles.buttonText}>
            @{name}
          </Text>
        </TouchableOpacity>
      ))}
      {(state === "missing" && !suggestions.length) || state === "error" ? (
        <View>
          <View style={styles.correction}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={search}
              placeholder={LL.common.username()}
              accessibilityLabel={LL.common.username()}
              autoCapitalize="none"
              autoCorrect={false}
              selectTextOnFocus
              maxLength={80}
              returnKeyType="search"
              style={styles.usernameInput}
              testID="ask-flash-contact-input"
            />
            <TouchableOpacity
              accessibilityRole="button"
              disabled={!draft.trim() || isOffline}
              accessibilityState={{ disabled: !draft.trim() || isOffline }}
              onPress={search}
              style={[
                styles.button,
                styles.searchButton,
                (!draft.trim() || isOffline) && styles.disabled,
              ]}
              testID="ask-flash-contact-search"
            >
              <Text type="p2" bold style={styles.buttonText}>
                {LL.common.search()}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={openSupport}
            style={styles.supportButton}
            testID="ask-flash-contact-support"
          >
            <Text type="p3" bold style={styles.supportText}>
              {LL.AskFlashHelp.supportChatAction()}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {available ? (
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.button}
          testID="ask-flash-contact-action"
          onPress={() =>
            entry.operation === "profile"
              ? navigation.navigate("contactDetails", { contactPubkey: pubkey })
              : entry.operation === "remove"
              ? confirmRemove()
              : change()
          }
        >
          <Text type="p2" bold style={styles.buttonText}>
            {label}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}
