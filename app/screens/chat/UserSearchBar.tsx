import { useI18nContext } from "@app/i18n/i18n-react"
import { SearchBar } from "@rneui/themed"
import { Event, nip05, nip19, SubCloser } from "nostr-tools"
import { useCallback, useState } from "react"
import { useChatContext } from "./chatContext"
import {
  fetchNostrUsers,
  getGroupId,
} from "@app/utils/nostr"
import { useStyles } from "./style"
import { useAppConfig } from "@app/hooks"
import { testProps } from "@app/utils/testProps"
import Icon from "react-native-vector-icons/Ionicons"
import { SubCloser } from "nostr-tools/abstract-pool"

interface UserSearchBarProps {
  setSearchedUsers: (q: Chat[]) => void
}

export const UserSearchBar: React.FC<UserSearchBarProps> = ({ setSearchedUsers }) => {
  const [searchText, setSearchText] = useState("")
  const { addEventToProfiles, profileMap, userPublicKey } = useChatContext()
  const [refreshing, setRefreshing] = useState(false)
  const styles = useStyles()
  const { appConfig } = useAppConfig()

  const reset = useCallback(() => {
    setSearchText("")
    setSearchedUsers([])
    setRefreshing(false)
  }, [])

  const { LL } = useI18nContext()

  const searchedUsersHandler = (event: Event, closer: SubCloser) => {
    let nostrProfile = JSON.parse(event.content)
    addEventToProfiles(event)
    let participants = [event.pubkey, userPublicKey!].filter(Boolean)
    setSearchedUsers([
      { ...nostrProfile, id: event.pubkey, groupId: getGroupId(participants) },
    ])
    closer.close()
  }

  const updateSearchResults = useCallback(
    async (newSearchText: string) => {
      if (newSearchText === "") reset()
      const nip05Matching = async (alias: string) => {
        let nostrUser = await nip05.queryProfile(alias.toLocaleLowerCase())
        console.log("nostr user for", alias, nostrUser)
        if (nostrUser) {
          let nostrProfile = profileMap?.get(nostrUser.pubkey)
          let participants = [nostrUser.pubkey, userPublicKey!].filter(Boolean)
          setSearchedUsers([
            {
              id: nostrUser.pubkey,
              username: alias,
              ...nostrProfile,
              groupId: getGroupId(participants),
            },
          ])
          if (!nostrProfile) fetchNostrUsers([nostrUser.pubkey], searchedUsersHandler)
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
        let participants = [hexPubkey, userPublicKey!].filter(Boolean)
        setSearchedUsers([{ id: hexPubkey, groupId: getGroupId(participants) }])
        fetchNostrUsers([hexPubkey], searchedUsersHandler)
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
    [userPublicKey],
  )

  return userPublicKey ? (
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
