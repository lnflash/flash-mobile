import { SearchBar } from "@rneui/base"
import { useTheme } from "@rneui/themed"
import * as React from "react"
import { useCallback, useState } from "react"
import {
  ActivityIndicator,
  Text,
  View,
  Alert,
  TouchableOpacity,
  Image,
} from "react-native"
import { FlatList } from "react-native-gesture-handler"
import Icon from "react-native-vector-icons/Ionicons"

import { Screen } from "../../components/screen"
import { bytesToHex } from "@noble/hashes/utils"
import { testProps } from "../../utils/testProps"

import { useI18nContext } from "@app/i18n/i18n-react"
import { getPublicKey, nip19 } from "nostr-tools"
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
import { useAppSelector } from "@app/store/redux"
import { ImportNsecModal } from "../../components/import-nsec/import-nsec-modal"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useHomeAuthedQuery } from "@app/graphql/generated"

export const NIP17Chat: React.FC = () => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  const isAuthed = useIsAuthed()

  const { data: dataAuthed } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
    errorPolicy: "all",
  })
  const { rumors, poolRef, profileMap, resetChat, activeSubscription, initializeChat } =
    useChatContext()
  const [initialized, setInitialized] = useState(false)
  const [searchedUsers, setSearchedUsers] = useState<Chat[]>([])
  const [privateKey, setPrivateKey] = useState<Uint8Array>()
  const [showImportModal, setShowImportModal] = useState<boolean>(false)
  const [skipMismatchCheck, setskipMismatchCheck] = useState<boolean>(false)
  const { LL } = useI18nContext()
  const { userData } = useAppSelector((state) => state.user)
  const navigation = useNavigation<StackNavigationProp<ChatStackParamList, "chatList">>()

  const navigateToContactDetails = (contactPubkey: string) => {
    if (!privateKey) return
    navigation.navigate("contactDetails", {
      contactPubkey,
      userPrivateKey: bytesToHex(privateKey),
    })
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
        console.log("Couldn't find secret key in local storage")
        setShowImportModal(true)
        return
      }
      let secret = nip19.decode(secretKeyString).data as Uint8Array
      setPrivateKey(secret)
      const accountNpub = dataAuthed?.me?.npub
      const storedNpub = nip19.npubEncode(getPublicKey(secret))
      if (!skipMismatchCheck && accountNpub && storedNpub !== accountNpub) {
        console.log("Account Info mismatch", accountNpub, storedNpub)
        setShowImportModal(true)
      }
      if (!activeSubscription) initializeChat()
      setInitialized(true)
    }
    if (!initialized && poolRef) initialize()
    return unsubscribe
  }, [poolRef, isAuthed])

  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true
      async function checkSecretKey() {
        if (!isMounted) return
        let secretKeyString = await fetchSecretFromLocalStorage()
        if (!secretKeyString) {
          setShowImportModal(true)
          return
        }
        let secret = nip19.decode(secretKeyString).data as Uint8Array
        const accountNpub = dataAuthed?.me?.npub
        const storedNpub = nip19.npubEncode(getPublicKey(secret))
        if (!skipMismatchCheck && accountNpub && storedNpub !== accountNpub) {
          setShowImportModal(true)
        }
      }
      if (initialized) {
        setSearchedUsers([])
        checkSecretKey()
      }
      return () => {
        isMounted = false
      }
    }, [setSearchedUsers, dataAuthed, isAuthed, skipMismatchCheck]),
  )

  let SearchBarContent: React.ReactNode
  let ListEmptyContent: React.ReactNode

  SearchBarContent = (
    <>
      <UserSearchBar setSearchedUsers={setSearchedUsers} />
    </>
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
  let groupIds = Array.from(groups.keys()).sort((a, b) => {
    let groupARumors = groups.get(a) || []
    let groupBRumors = groups.get(b) || []
    let lastARumor = groupARumors[groupARumors.length ? groupARumors.length - 1 : 0]
    let lastBRumor = groupBRumors[groupBRumors.length ? groupBRumors.length - 1 : 0]
    return (lastBRumor?.created_at || 0) - (lastARumor?.created_at || 0)
  })

  return (
    <Screen style={{ ...styles.header, flex: 1 }}>
      {privateKey && !showImportModal ? (
        <View style={{ flex: 1 }}>
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
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 24,
                  marginTop: 20,
                  marginLeft: 20,
                  color: colors.primary3,
                }}
              >
                Chats
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  margin: 10,
                  marginLeft: 20,
                  color: colors.primary3,
                }}
              >
                signed in as:{" "}
                <Text style={{ color: colors.primary, fontWeight: "bold" }}>
                  {userData?.username || nip19.npubEncode(getPublicKey(privateKey))}
                </Text>
              </Text>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("Nip29GroupChat", { groupId: "support-group-id" })
                }
                style={{ marginRight: 10, marginLeft: 10, marginBottom: 4 }}
              >
                <View
                  style={{
                    ...styles.itemContainer,
                    justifyContent: "center",
                    alignContent: "center",
                    alignItems: "center",
                    alignSelf: "center",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginHorizontal: 20,
                      marginVertical: 4,
                    }}
                  >
                    <Image
                      source={{
                        uri: "https://cdn0.iconfinder.com/data/icons/business-strategy-4/100/Community-1024.png",
                      }}
                      style={styles.communityPicture}
                    />
                    <View style={{ flexDirection: "column", maxWidth: "80%" }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text
                          style={{
                            ...styles.itemText,
                            fontWeight: "bold",
                            marginBottom: 4,
                            marginTop: 4,
                          }}
                        >
                          Chat with Support
                        </Text>
                        <Icon
                          name="checkmark-done-circle-outline"
                          size={20}
                          style={styles.verifiedIcon}
                        />
                      </View>
                      <Text style={{ ...styles.itemText, marginTop: 4, marginBottom: 5 }}>
                        Have questions or need help? Chat with our support team.
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
              <FlatList
                contentContainerStyle={styles.listContainer}
                data={groupIds}
                ListEmptyComponent={ListEmptyContent}
                scrollEnabled={true}
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
      <ImportNsecModal
        isActive={showImportModal}
        onCancel={() => {
          setShowImportModal(false)
        }}
        onSubmit={() => {
          resetChat()
        }}
      />
    </Screen>
  )
}
