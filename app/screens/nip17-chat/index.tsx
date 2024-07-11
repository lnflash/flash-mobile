import { StackNavigationProp } from "@react-navigation/stack"
import { SearchBar } from "@rneui/base"
import { ListItem, makeStyles, useTheme } from "@rneui/themed"
import * as React from "react"
import { useCallback, useState } from "react"
import { ActivityIndicator, Text, View, Image, Alert } from "react-native"
import { FlatList } from "react-native-gesture-handler"
import Icon from "react-native-vector-icons/Ionicons"

import { Screen } from "../../components/screen"
import { ChatStackParamList } from "../../navigation/stack-param-lists"
import { testProps } from "../../utils/testProps"

import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import {
  Event,
  Relay,
  Subscription,
  UnsignedEvent,
  getPublicKey,
  nip05,
  nip19,
} from "nostr-tools"
import {
  Rumor,
  convertRumorsToGroups,
  fetchGiftWrapsForPublicKey,
  fetchSecretFromLocalStorage,
  getRumorFromWrap,
} from "@app/utils/nostr"
import { errorCodes } from "@apollo/client/invariantErrorCodes"
import { useStyles } from "./style"
import { SearchListItem } from "./searchListItem"
import { HistoryListItem } from "./historyListItem"

export const NIP17Chat: React.FC = () => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  const navigation = useNavigation<StackNavigationProp<ChatStackParamList, "chatList">>()
  const [giftwrapEvents, setGiftWrapEvents] = useState<Event[] | undefined>()
  const [rumors, setRumors] = useState<Rumor[] | undefined>()
  const [searchText, setSearchText] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [searchedUsers, setSearchedUsers] = useState<Chat[]>([])
  const [privateKey, setPrivateKey] = useState<Uint8Array>()
  const { LL } = useI18nContext()

  const reset = useCallback(() => {
    setSearchText("")
  }, [])

  const handleGiftWraps = (privateKey: Uint8Array) => {
    return (event: Event) => {
      setGiftWrapEvents((prevEvents) => [...(prevEvents || []), event])
      try {
        let rumor = getRumorFromWrap(event, privateKey)
        setRumors((prevRumors) => [...(prevRumors || []), rumor])
        console.log("Rumor was", rumor)
      } catch (e) {
        console.log("Error in decrypting...", e)
      }
    }
  }

  React.useEffect(() => {
    let relay: Relay
    const unsubscribe = () => {
      console.log("unsubscribing", relay)
      setInitialized(false)
      if (relay) {
        relay.close()
      }
    }
    async function initialize() {
      console.log("Initializing nip17 screen use effect")
      let secretKeyString = await fetchSecretFromLocalStorage()
      if (!secretKeyString) {
        Alert.alert("Secret Key Not Found in Storage")
        return
      }
      let secret = nip19.decode(secretKeyString).data as Uint8Array
      setPrivateKey(secret)
      const publicKey = getPublicKey(secret)
      fetchGiftWrapsForPublicKey(publicKey, handleGiftWraps(secret)).then((r: Relay) => {
        relay = r
      })
      setInitialized(true)
    }
    if (!initialized) initialize()
    return unsubscribe
  }, [])

  const updateSearchResults = useCallback(async (newSearchText: string) => {
    setRefreshing(true)
    setSearchText(newSearchText)
    const aliasPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/
    if (newSearchText.match(aliasPattern)) {
      let nostrUser = await nip05.queryProfile(newSearchText.toLowerCase())
      console.log("found nostr user", nostrUser)
      if (nostrUser) setSearchedUsers([{ id: nostrUser.pubkey }])
    }
    if (newSearchText.startsWith("npub1") && newSearchText.length == 63) {
      setSearchedUsers([])
      try {
        // let nostrProfile = await fetchNostrUser(newSearchText as `npub1${string}`)
      } catch (e) {
        console.log("Error fetching nostr profile", e)
      }
      setRefreshing(false)
      return
    }
  }, [])

  let SearchBarContent: React.ReactNode
  let ListEmptyContent: React.ReactNode

  SearchBarContent = (
    <SearchBar
      {...testProps(LL.common.chatSearch())}
      placeholder={LL.common.chatSearch()}
      value={searchText}
      onChangeText={updateSearchResults}
      platform="default"
      round
      showLoading={refreshing}
      containerStyle={styles.searchBarContainer}
      inputContainerStyle={styles.searchBarInputContainerStyle}
      inputStyle={styles.searchBarText}
      rightIconContainerStyle={styles.searchBarRightIconStyle}
      searchIcon={<Icon name="search" size={24} color={styles.icon.color} />}
      clearIcon={
        <Icon name="close" size={24} onPress={reset} color={styles.icon.color} />
      }
    />
  )

  if (!initialized) {
    ListEmptyContent = (
      <View style={styles.activityIndicatorContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  } else {
    ListEmptyContent = (
      <View style={styles.emptyListNoContacts}>
        <Text {...testProps(LL.ChatScreen.noChatsTitle())} style={styles.emptyListTitle}>
          {LL.ChatScreen.noChatsTitle()}
        </Text>
        <Text style={styles.emptyListText}>{LL.ChatScreen.noChatsYet()}</Text>
      </View>
    )
  }

  return (
    <Screen style={styles.header}>
      <Text>THIS IS NIP17 CHAT</Text>
      {SearchBarContent}

      {searchText ? (
        <FlatList
          contentContainerStyle={styles.listContainer}
          data={searchedUsers}
          ListEmptyComponent={ListEmptyContent}
          renderItem={({ item }) => <SearchListItem item={item} />}
          keyExtractor={(item) => item.id}
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContainer}
          data={Array.from(convertRumorsToGroups(rumors || []).values())}
          ListEmptyComponent={ListEmptyContent}
          renderItem={({ item }) => {
            return <HistoryListItem item={item} />
          }}
          keyExtractor={(item) => {
            let participants = item[0].tags.filter((t) => t[0] === "p").map((p) => p[1])
            participants.sort()
            return participants.join(",")
          }}
        />
      )}
    </Screen>
  )
}
