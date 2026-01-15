import { useTheme } from "@rneui/themed"
import * as React from "react"
import { useMemo, useState, useEffect } from "react"
import {
  ActivityIndicator,
  Text,
  View,
  TouchableOpacity,
  Image,
  Platform,
  StatusBar,
} from "react-native"
import { FlatList } from "react-native-gesture-handler"
import Icon from "react-native-vector-icons/Ionicons"

import { Screen } from "../../components/screen"
import { bytesToHex } from "@noble/hashes/utils"
import { testProps } from "../../utils/testProps"

import { useI18nContext } from "@app/i18n/i18n-react"
import { getPublicKey, nip19, Event } from "nostr-tools"
import {
  convertRumorsToGroups,
  fetchSecretFromLocalStorage,
  getRumorFromWrap,
  Rumor,
} from "@app/utils/nostr"
import { useStyles } from "./style"
import { HistoryListItem } from "./historyListItem"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
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
import ContactDetailsScreen from "./contactDetailsScreen"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"

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

  const [privateKey, setPrivateKey] = useState<Uint8Array>()
  const [showImportModal, setShowImportModal] = useState(false)
  const [skipMismatchCheck, setSkipMismatchCheck] = useState(false)
  const [searchedUsers, setSearchedUsers] = useState<Chat[]>([])
  const { LL } = useI18nContext()
  const { userData } = useAppSelector((state) => state.user)
  const navigation = useNavigation<StackNavigationProp<ChatStackParamList, "chatList">>()
  const RootNavigator =
    useNavigation<StackNavigationProp<RootStackParamList, "Nip29GroupChat">>()
  const { groupMetadata } = useNostrGroupChat()

  // -------------------------------
  // Initialize private key and check mismatch
  // -------------------------------
  useEffect(() => {
    let mounted = true

    async function initKey() {
      const secretKeyString = await fetchSecretFromLocalStorage()
      if (!mounted) return
      if (!secretKeyString) {
        setShowImportModal(true)
        return
      }

      const secret = nip19.decode(secretKeyString).data as Uint8Array
      setPrivateKey(secret)

      const accountNpub = dataAuthed?.me?.npub
      const storedNpub = nip19.npubEncode(getPublicKey(secret))
      if (!skipMismatchCheck && accountNpub && storedNpub !== accountNpub) {
        setShowImportModal(true)
      }

      // Ensure giftwrap subscription
      const userPubkey = getPublicKey(secret)
      const giftwrapFilter = [{ "kinds": [1059], "#p": [userPubkey], "limit": 150 }]
      nostrRuntime.ensureSubscription("giftwraps", giftwrapFilter)
    }

    initKey()
    return () => {
      mounted = false
      nostrRuntime.releaseSubscription("giftwraps")
    }
  }, [dataAuthed, skipMismatchCheck])

  // -------------------------------
  // Get decrypted rumors
  // -------------------------------
  const decryptedRumors = useMemo(() => {
    if (!privateKey) return []

    const allEvents: Event[] = nostrRuntime.getAllEvents()
    const giftwraps = allEvents.filter((e) => e.kind === 1059)

    const rumors: Rumor[] = []
    for (const wrap of giftwraps) {
      try {
        const rumor = getRumorFromWrap(wrap, privateKey)
        rumors.push(rumor)
      } catch (e) {
        console.warn("Failed to decrypt giftwrap", e)
      }
    }

    return rumors
  }, [privateKey, nostrRuntime.getAllEvents()])

  const groups = useMemo(() => convertRumorsToGroups(decryptedRumors), [decryptedRumors])
  const groupIds = useMemo(() => {
    return Array.from(groups.keys()).sort((a, b) => {
      const lastA = groups.get(a)?.at(-1)
      const lastB = groups.get(b)?.at(-1)
      return (lastB?.created_at || 0) - (lastA?.created_at || 0)
    })
  }, [groups])

  const userPublicKey = privateKey ? getPublicKey(privateKey) : null

  // -------------------------------
  // Status bar height for Android
  // -------------------------------
  const statusBarHeight = Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0

  // -------------------------------
  // List empty / search content
  // -------------------------------
  const ListEmptyContent = (
    <View style={styles.emptyListNoContacts}>
      <Text {...testProps(LL.ChatScreen.noChatsTitle())} style={styles.emptyListTitle}>
        {LL.ChatScreen.noChatsTitle()}
      </Text>
      <Text style={styles.emptyListText}>{LL.ChatScreen.noChatsYet()}</Text>
    </View>
  )

  const SearchBarContent = <UserSearchBar setSearchedUsers={setSearchedUsers} />

  return (
    <Screen style={{ flex: 1 }}>
      <StatusBar translucent backgroundColor="transparent" />
      {privateKey && !showImportModal ? (
        <View style={{ flex: 1, paddingTop: statusBarHeight }}>
          <Tab.Navigator
            screenOptions={({ route }) => {
              return {
                tabBarIcon: ({ color }) => {
                  let iconName: string
                  if (route.name === "Profile") iconName = "person"
                  else if (route.name === "Chats")
                    iconName = "chatbubble-ellipses-outline"
                  else if (route.name === "Contacts") iconName = "people-outline"
                  else iconName = "person-circle-outline"
                  return <Icon name={iconName} size={24} color={color} />
                },
                tabBarShowLabel: false,
                tabBarActiveTintColor: colors.primary,
                tabBarIndicatorStyle: { backgroundColor: colors.primary },
              }
            }}
          >
            {/* ------------------- Chats Tab ------------------- */}
            <Tab.Screen name="Chats">
              {() => (
                <View style={{ flex: 1 }}>
                  {SearchBarContent}
                  {searchedUsers.length > 0 ? (
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
                      {/* Signed in as */}
                      <View style={styles.usernameContainer}>
                        <Text style={styles.usernameText}>
                          signed in as:{" "}
                          <Text style={{ color: colors.primary, fontWeight: "bold" }}>
                            {userData?.username ||
                              nip19.npubEncode(getPublicKey(privateKey))}
                          </Text>
                        </Text>
                      </View>

                      {/* Support Group */}
                      <TouchableOpacity
                        onPress={() =>
                          RootNavigator.navigate("Nip29GroupChat", {
                            groupId: "support-group-id",
                          })
                        }
                        style={{ marginHorizontal: 20, marginBottom: 4 }}
                      >
                        <View style={styles.itemContainer}>
                          <View style={{ flexDirection: "row", marginVertical: 4 }}>
                            <Image
                              source={
                                groupMetadata.picture
                                  ? { uri: groupMetadata.picture }
                                  : require("../../assets/images/Flash-Mascot.png")
                              }
                              style={styles.communityPicture}
                            />
                            <View
                              style={{
                                flexDirection: "column",
                                maxWidth: "80%",
                                alignItems: "flex-start",
                              }}
                            >
                              <View
                                style={{ flexDirection: "row", alignItems: "center" }}
                              >
                                <Text
                                  style={{
                                    ...styles.itemText,
                                    fontWeight: "bold",
                                    marginVertical: 4,
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
                                style={{ ...styles.itemText, marginVertical: 4 }}
                                numberOfLines={3}
                                ellipsizeMode="tail"
                              >
                                {groupMetadata.about || "..."}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>

                      {/* Chat Groups */}
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

            {/* ------------------- Profile Tab ------------------- */}
            <Tab.Screen
              name={`Profile: ${userPublicKey ? userPublicKey.slice(0, 8) : ""}`}
              component={ContactDetailsScreen}
              initialParams={{
                contactPubkey: userPublicKey,
                userPrivateKey: bytesToHex(privateKey || new Uint8Array()),
              }}
            />

            {/* ------------------- Contacts Tab ------------------- */}
            <Tab.Screen name="Contacts">
              {() => (
                <View style={{ height: "100%" }}>
                  <Contacts userPrivateKey={bytesToHex(privateKey || new Uint8Array())} />
                </View>
              )}
            </Tab.Screen>
          </Tab.Navigator>
        </View>
      ) : (
        <View style={styles.activityIndicatorContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text>Loading your nostr keys...</Text>
        </View>
      )}

      {/* ------------------- Import Modal ------------------- */}
      <ImportNsecModal
        isActive={showImportModal}
        onCancel={() => setShowImportModal(false)}
        onSubmit={() => {
          setShowImportModal(false)
        }}
      />
    </Screen>
  )
}
