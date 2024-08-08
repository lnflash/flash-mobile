import { SearchBar } from "@rneui/base"
import { useTheme } from "@rneui/themed"
import * as React from "react"
import { useCallback, useState } from "react"
import { ActivityIndicator, Text, View, Image, Alert } from "react-native"
import { FlatList } from "react-native-gesture-handler"
import Icon from "react-native-vector-icons/Ionicons"

import { Screen } from "../../components/screen"
import { testProps } from "../../utils/testProps"

import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { Event, SubCloser, getPublicKey, nip05, nip19 } from "nostr-tools"
import {
  Rumor,
  convertRumorsToGroups,
  fetchGiftWrapsForPublicKey,
  fetchNostrUsers,
  fetchSecretFromLocalStorage,
  getRumorFromWrap,
} from "@app/utils/nostr"
import { useStyles } from "./style"
import { SearchListItem } from "./searchListItem"
import { HistoryListItem } from "./historyListItem"
import { useChatContext } from "./chatContext"

export const NIP17Chat: React.FC = () => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  const { giftwraps, rumors, setRumors, setGiftWraps, poolRef } = useChatContext()
  const [searchText, setSearchText] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [searchedUsers, setSearchedUsers] = useState<Chat[]>([])
  const [privateKey, setPrivateKey] = useState<Uint8Array>()
  const { LL } = useI18nContext()

  const navigation = useNavigation()

  const reset = useCallback(() => {
    setSearchText("")
  }, [])

  const handleGiftWraps = (privateKey: Uint8Array) => {
    return (event: Event) => {
      setGiftWraps((prevEvents) => [...(prevEvents || []), event])
      try {
        let rumor = getRumorFromWrap(event, privateKey)
        setRumors((prevRumors) => {
          let previousRumors = prevRumors || []
          if (!previousRumors.map((r) => r.id).includes(rumor)) {
            return [...(prevRumors || []), rumor]
          }
          return prevRumors
        })
      } catch (e) {
        console.log("Error in decrypting...", e)
      }
    }
  }

  const searchedUsersHandler = (event: Event, closer: SubCloser) => {
    let nostrProfile = JSON.parse(event.content)
    setSearchedUsers([{ ...nostrProfile, id: event.pubkey }])
    setRefreshing(false)
    closer.close()
  }

  React.useEffect(() => {
    let closer: SubCloser
    const unsubscribe = () => {
      console.log("unsubscribing", closer)
      setInitialized(false)
      if (closer) {
        closer.close()
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
      fetchGiftWrapsForPublicKey(
        publicKey,
        handleGiftWraps(secret),
        poolRef!.current,
      ).then((c: SubCloser) => {
        closer = c
      })
      setInitialized(true)
    }
    if (!initialized && poolRef) initialize()
    return unsubscribe
  }, [poolRef])

  const updateSearchResults = useCallback(async (newSearchText: string) => {
    setRefreshing(true)
    setSearchText(newSearchText)
    const aliasPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/
    if (newSearchText.match(aliasPattern)) {
      let nostrUser = await nip05.queryProfile(newSearchText.toLowerCase())
      console.log("found nostr user", nostrUser)
      if (nostrUser) {
        setSearchedUsers([{ id: nostrUser.pubkey }])
        fetchNostrUsers([nostrUser.pubkey], poolRef!.current, searchedUsersHandler)
      }
    }
    if (newSearchText.startsWith("npub1") && newSearchText.length == 63) {
      let hexPubkey = nip19.decode(newSearchText).data as string
      setSearchedUsers([{ id: hexPubkey }])
      fetchNostrUsers([hexPubkey], poolRef!.current, searchedUsersHandler)
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

  let groups = convertRumorsToGroups(rumors || [])
  let groupIds = Array.from(groups.keys())

  return (
    <Screen style={styles.header}>
      {SearchBarContent}

      {searchText ? (
        <FlatList
          contentContainerStyle={styles.listContainer}
          data={searchedUsers}
          ListEmptyComponent={ListEmptyContent}
          renderItem={({ item }) => (
            <SearchListItem item={item} userPrivateKey={privateKey!} />
          )}
          keyExtractor={(item) => item.id}
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContainer}
          data={groupIds}
          ListEmptyComponent={ListEmptyContent}
          renderItem={({ item }) => {
            return <HistoryListItem item={item} userPrivateKey={privateKey!} />
          }}
        />
      )}
    </Screen>
  )
}
