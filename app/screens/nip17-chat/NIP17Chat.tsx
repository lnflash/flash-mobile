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
import { Event, SubCloser, getPublicKey, nip05, nip19 } from "nostr-tools"
import {
  convertRumorsToGroups,
  fetchNostrUsers,
  fetchSecretFromLocalStorage,
  getGroupId,
} from "@app/utils/nostr"
import { useStyles } from "./style"
import { SearchListItem } from "./searchListItem"
import { HistoryListItem } from "./historyListItem"
import { useChatContext } from "./chatContext"
import { useFocusEffect } from "@react-navigation/native"
import { useAppConfig } from "@app/hooks"

export const NIP17Chat: React.FC = () => {
  const styles = useStyles()
  const { appConfig } = useAppConfig()
  const {
    theme: { colors },
  } = useTheme()
  const { rumors, poolRef, addEventToProfiles, profileMap } = useChatContext()
  const [searchText, setSearchText] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [searchedUsers, setSearchedUsers] = useState<Chat[]>([])
  const [privateKey, setPrivateKey] = useState<Uint8Array>()
  const { LL } = useI18nContext()

  const reset = useCallback(() => {
    setSearchText("")
    setSearchedUsers([])
    setRefreshing(false)
  }, [])

  const searchedUsersHandler = (event: Event, closer: SubCloser) => {
    let nostrProfile = JSON.parse(event.content)
    addEventToProfiles(event)
    let userPubkey = getPublicKey(privateKey!)
    let participants = [event.pubkey, userPubkey]
    setSearchedUsers([
      { ...nostrProfile, id: event.pubkey, groupId: getGroupId(participants) },
    ])
    closer.close()
  }

  React.useEffect(() => {
    const unsubscribe = () => {
      console.log("unsubscribing")
      setInitialized(false)
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
      setInitialized(true)
    }
    if (!initialized && poolRef) initialize()
    return unsubscribe
  }, [poolRef])

  useFocusEffect(
    React.useCallback(() => {
      setSearchText("")
      setSearchedUsers([])
    }, [setSearchText, setSearchedUsers]),
  )

  const updateSearchResults = useCallback(
    async (newSearchText: string) => {
      const nip05Matching = async (alias: string) => {
        let nostrUser = await nip05.queryProfile(alias.toLocaleLowerCase())
        console.log("nostr user for", alias, nostrUser)
        if (nostrUser) {
          let nostrProfile = profileMap?.get(nostrUser.pubkey)
          let userPubkey = getPublicKey(privateKey!)
          let participants = [nostrUser.pubkey, userPubkey]
          setSearchedUsers([
            {
              id: nostrUser.pubkey,
              username: alias,
              ...nostrProfile,
              groupId: getGroupId(participants),
            },
          ])
          if (!nostrProfile)
            fetchNostrUsers([nostrUser.pubkey], poolRef!.current, searchedUsersHandler)
          return true
        }
        return false
      }
      const aliasPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/
      if (!privateKey) {
        Alert.alert("User Profile not yet loaded")
        return
      }
      if (!newSearchText) {
        setRefreshing(false)
      }
      setRefreshing(true)
      setSearchText(newSearchText)
      if (newSearchText.startsWith("npub1") && newSearchText.length == 63) {
        let hexPubkey = nip19.decode(newSearchText).data as string
        let userPubkey = getPublicKey(privateKey)
        let participants = [hexPubkey, userPubkey]
        setSearchedUsers([{ id: hexPubkey, groupId: getGroupId(participants) }])
        fetchNostrUsers([hexPubkey], poolRef!.current, searchedUsersHandler)
        setRefreshing(false)
        return
      } else if (newSearchText.match(aliasPattern)) {
        if (await nip05Matching(newSearchText)) {
          setRefreshing(false)
          return
        }
      } else if (!newSearchText.includes("@")) {
        let modifiedSearchText =
          newSearchText + "@" + appConfig.galoyInstance.lnAddressHostname
        console.log("Searching for", modifiedSearchText)
        if (await nip05Matching(modifiedSearchText)) {
          setRefreshing(false)
          return
        }
      }
    },
    [privateKey],
  )

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
      showLoading={refreshing && !!searchText}
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
      {privateKey ? (
        <View>
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
            <View>
              <Text
                style={{
                  fontSize: 24,
                  margin: 20,
                  color: colors.primary3,
                }}
              >
                Chats
              </Text>
              <FlatList
                contentContainerStyle={styles.listContainer}
                data={groupIds}
                ListEmptyComponent={ListEmptyContent}
                renderItem={({ item }) => {
                  return (
                    <HistoryListItem
                      item={item}
                      userPrivateKey={privateKey!}
                      groups={groups}
                    />
                  )
                }}
                keyExtractor={(item) => item}
              />
            </View>
          )}
        </View>
      ) : (
        <Text>Loading your nostr keys...</Text>
      )}
    </Screen>
  )
}
