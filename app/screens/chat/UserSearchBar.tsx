import { useI18nContext } from "@app/i18n/i18n-react"
import { SearchBar } from "@rneui/themed"
import { Event, nip05, nip19, SubCloser } from "nostr-tools"
import { useCallback, useState } from "react"
import { useChatContext } from "./chatContext"
import { fetchNostrUsers, getGroupId } from "@app/utils/nostr"
import { useStyles } from "./style"
import { useAppConfig } from "@app/hooks"
import { testProps } from "@app/utils/testProps"
import Icon from "react-native-vector-icons/Ionicons"
import { pool } from "@app/utils/nostr/pool"

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
    if (!userPublicKey) return
    const nostrProfile = JSON.parse(event.content)
    addEventToProfiles(event)
    const participants = [event.pubkey, userPublicKey]
    setSearchedUsers([
      { ...nostrProfile, id: event.pubkey, groupId: getGroupId(participants) },
    ])
    closer.close()
  }

  const updateSearchResults = useCallback(
    async (newSearchText: string) => {
      if (!userPublicKey) return
      if (newSearchText === "") reset()
      const nip05Matching = async (alias: string) => {
        const nostrUser = await nip05.queryProfile(alias.toLocaleLowerCase())
        console.log("nostr user for", alias, nostrUser)
        if (nostrUser) {
          const nostrProfile = profileMap?.get(nostrUser.pubkey)
          const participants = [nostrUser.pubkey, userPublicKey]
          setSearchedUsers([
            {
              id: nostrUser.pubkey,
              username: alias,
              ...nostrProfile,
              groupId: getGroupId(participants),
            },
          ])
          if (!nostrProfile) fetchNostrUsers([nostrUser.pubkey], pool, searchedUsersHandler)
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
        const hexPubkey = nip19.decode(newSearchText).data as string
        const participants = [hexPubkey, userPublicKey]
        setSearchedUsers([{ id: hexPubkey, groupId: getGroupId(participants) }])
        fetchNostrUsers([hexPubkey], pool, searchedUsersHandler)
        setRefreshing(false)
        return
      } else if (newSearchText.match(aliasPattern)) {
        if (await nip05Matching(newSearchText)) {
          setRefreshing(false)
          return
        }
      } else if (!newSearchText.includes("@")) {
        const modifiedSearchText =
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
