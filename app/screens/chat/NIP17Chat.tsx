import { useTheme, Image } from "@rneui/themed"
import * as React from "react"
import { useState } from "react"
import { ActivityIndicator, Text, View, TouchableOpacity } from "react-native"
import { FlatList } from "react-native-gesture-handler"
import Icon from "react-native-vector-icons/Ionicons"

import { Screen } from "../../components/screen"
import { bytesToHex } from "@noble/hashes/utils"
import { testProps } from "../../utils/testProps"

import { useI18nContext } from "@app/i18n/i18n-react"
import { getPublicKey, nip19 } from "nostr-tools"
import { convertRumorsToGroups, fetchSecretFromLocalStorage } from "@app/utils/nostr"
import { useStyles } from "./style"
import { HistoryListItem } from "./historyListItem"
import { useChatContext } from "./chatContext"
import { useFocusEffect, useNavigation } from "@react-navigation/native"
import { useAppSelector } from "@app/store/redux"
import { ImportNsecModal } from "../../components/import-nsec/import-nsec-modal"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useHomeAuthedQuery } from "@app/graphql/generated"
import { UserSearchBar } from "./UserSearchBar"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList, RootStackParamList } from "@app/navigation/stack-param-lists"
import { useNostrGroupChat } from "./GroupChat/GroupChatProvider"
import { SearchListItem } from "./searchListItem"
import Contacts from "./contacts"
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs"
import NostrQuickStart from "@app/components/nostr-quickstart"

const Tab = createMaterialTopTabNavigator()

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
  const RootNavigator =
    useNavigation<StackNavigationProp<RootStackParamList, "Nip29GroupChat">>()

  const { groupMetadata } = useNostrGroupChat()

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
        <Tab.Navigator
          screenOptions={({ route }) => ({
            // tabBarLabelStyle: { fontSize: 18, fontWeight: "600" },
            // tabBarIndicatorStyle: { backgroundColor: "#60aa55" },
            // tabBarIndicatorStyle: { backgroundColor: "#60aa55" },
            tabBarIcon: ({ color }) => {
              let iconName: string
              if (route.name === "Chats") {
                iconName = "chatbubble-ellipses-outline" // Chat icon
              } else if (route.name === "Contacts") {
                iconName = "people-outline" // Contacts icon
              } else {
                iconName = ""
              }
              return <Icon name={iconName} size={24} color={color} />
            },
            tabBarShowLabel: false, // Hide text labels
          })}
        >
          <Tab.Screen name="Chats">
            {() => (
              <View style={{ flex: 1 }}>
                {SearchBarContent}
                {searchedUsers.length !== 0 ? (
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
                  <View style={{ flex: 1, flexDirection: "column" }}>
                    {/* Signed in as */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginHorizontal: 20,
                        marginVertical: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          color: colors.primary3,
                        }}
                        onPress={() => {}}
                      >
                        signed in as:{" "}
                        <Text style={{ color: colors.primary, fontWeight: "bold" }}>
                          {userData?.username ||
                            nip19.npubEncode(getPublicKey(privateKey))}
                        </Text>
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() =>
                        RootNavigator.navigate("Nip29GroupChat", {
                          groupId: "support-group-id",
                        })
                      }
                      style={{ marginRight: 20, marginLeft: 20, marginBottom: 4 }}
                    >
                      <View
                        style={{
                          ...styles.itemContainer,
                          // justifyContent: "center",
                          // alignContent: "center",
                          // alignItems: "center",
                          // alignSelf: "center",
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",

                            marginVertical: 4,
                          }}
                        >
                          <Image
                            source={{
                              uri:
                                groupMetadata.picture || "../../assets/Flash-Mascot.png",
                            }}
                            style={styles.communityPicture}
                          />
                          <View
                            style={{
                              flexDirection: "column",
                              maxWidth: "80%",
                              alignItems: "flex-start",
                            }}
                          >
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                              <Text
                                style={{
                                  ...styles.itemText,
                                  fontWeight: "bold",
                                  marginBottom: 4,
                                  marginTop: 4,
                                }}
                              >
                                {groupMetadata.name || "Support Group Chat"}
                              </Text>
                              <Icon
                                name="checkmark-done-circle-outline"
                                size={20}
                                style={styles.verifiedIcon}
                              />
                            </View>
                            <Text
                              style={{
                                ...styles.itemText,
                                marginTop: 4,
                                marginBottom: 5,
                              }}
                              numberOfLines={3} // show max 3 lines
                              ellipsizeMode="tail" // add "..." at the end if overflowing
                            >
                              {groupMetadata.about || "..."}
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
                      renderItem={({ item }) => (
                        <HistoryListItem
                          item={item}
                          userPrivateKey={privateKey!}
                          groups={groups}
                        />
                      )}
                      keyExtractor={(item) => item}
                    />
                  </View>
                )}
              </View>
            )}
          </Tab.Screen>
          <Tab.Screen name="Contacts">
            {() => (
              <View style={{ ...styles.header, height: "100%" }}>
                <Contacts userPrivateKey={bytesToHex(privateKey)} />
              </View>
            )}
          </Tab.Screen>
        </Tab.Navigator>
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
