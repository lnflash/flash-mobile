import { useI18nContext } from "@app/i18n/i18n-react"
import { SearchBar } from "@rneui/themed"
import { Event, getPublicKey, nip05, nip19, SubCloser } from "nostr-tools"
import { useCallback, useEffect, useState } from "react"
import { useChatContext } from "./chatContext"
import {
  fetchNostrUsers,
  fetchSecretFromLocalStorage,
  getGroupId,
} from "@app/utils/nostr"
import { hexToBytes } from "@noble/curves/abstract/utils"
import { useStyles } from "./style"
import { Alert } from "react-native"
import { useAppConfig } from "@app/hooks"
import { testProps } from "@app/utils/testProps"
import Icon from "react-native-vector-icons/Ionicons"

interface UserSearchBarProps {
  setSearchedUsers: (q: Chat[]) => void
}

export const UserSearchBar: React.FC<UserSearchBarProps> = ({ setSearchedUsers }) => {
  const [searchText, setSearchText] = useState("")
  const { rumors, poolRef, addEventToProfiles, profileMap, resetChat } = useChatContext()
  const [refreshing, setRefreshing] = useState(false)
  const [privateKey, setPrivateKey] = useState<Uint8Array | null>(null)
  const styles = useStyles()
  const { appConfig } = useAppConfig()

  const reset = useCallback(() => {
    setSearchText("")
    setSearchedUsers([])
    setRefreshing(false)
  }, [])

  useEffect(() => {
    const initialize = async () => {
      let secretKeyString = await fetchSecretFromLocalStorage()
      if (secretKeyString) setPrivateKey(nip19.decode(secretKeyString).data as Uint8Array)
    }
    initialize()
  }, [])

  const { LL } = useI18nContext()

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
      if (!newSearchText) {
        setRefreshing(false)
      }
      setRefreshing(true)
      setSearchText(newSearchText)
      if (newSearchText.startsWith("npub1") && newSearchText.length == 63) {
        let hexPubkey = nip19.decode(newSearchText).data as string
        let userPubkey = getPublicKey(privateKey!)
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

  return privateKey ? (
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
  ) : null
}
