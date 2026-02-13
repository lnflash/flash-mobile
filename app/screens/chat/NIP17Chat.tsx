import { useTheme } from "@rneui/themed"
import * as React from "react"
import { useState } from "react"
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
import {
  createMaterialTopTabNavigator,
  MaterialTopTabBar,
} from "@react-navigation/material-top-tabs"
import { TabBarItem } from "react-native-tab-view"
import ContactDetailsScreen from "./contactDetailsScreen"

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

  const {
    rumors,
    profileMap,
    resetChat,
    initializeChat,
    userProfileEvent,
    userPublicKey,
    contactsEvent,
    setContactsEvent,
  } = useChatContext()

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

  // ------------------------
  // Initialize on mount
  // ------------------------
  React.useEffect(() => {
    async function initialize() {
      console.log("Initializing nip17 screen use effect")
      const secretKeyString = await fetchSecretFromLocalStorage()
      if (!secretKeyString) {
        console.log("Couldn't find secret key in local storage")
        setShowImportModal(true)
        return
      }

      const secret = nip19.decode(secretKeyString).data as Uint8Array
      setPrivateKey(secret)

      const accountNpub = dataAuthed?.me?.npub
      const storedNpub = nip19.npubEncode(getPublicKey(secret))
      if (!skipMismatchCheck && accountNpub && storedNpub !== accountNpub) {
        console.log("Account Info mismatch", accountNpub, storedNpub)
        setShowImportModal(true)
      }

      if (!initialized) {
        await initializeChat() // runtime handles all subscriptions
        setInitialized(true)
      }
    }

    initialize()
  }, [dataAuthed, initialized, skipMismatchCheck])

  // ------------------------
  // Focus effect for secret key / import modal check
  // ------------------------
  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true
      async function checkSecretKey() {
        if (!isMounted) return
        const secretKeyString = await fetchSecretFromLocalStorage()
        if (!secretKeyString) {
          setShowImportModal(true)
          return
        }
        const secret = nip19.decode(secretKeyString).data as Uint8Array
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
    }, [setSearchedUsers, dataAuthed, isAuthed, skipMismatchCheck, initialized]),
  )

  // ------------------------
  // UI helpers
  // ------------------------
  const statusBarHeight = Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0

  const SearchBarContent = <UserSearchBar setSearchedUsers={setSearchedUsers} />

  const ListEmptyContent = !initialized ? (
    <View style={styles.activityIndicatorContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  ) : (
    <View style={styles.emptyListNoContacts}>
      <Text {...testProps(LL.ChatScreen.noChatsTitle())} style={styles.emptyListTitle}>
        {LL.ChatScreen.noChatsTitle()}
      </Text>
      <Text style={styles.emptyListText}>{LL.ChatScreen.noChatsYet()}</Text>
    </View>
  )

  // ------------------------
  // Groups derived from rumors
  // ------------------------
  const groups = convertRumorsToGroups(rumors || [])
  const groupIds = Array.from(groups.keys()).sort((a, b) => {
    const lastARumor = groups.get(a)?.at(-1)
    const lastBRumor = groups.get(b)?.at(-1)
    return (lastBRumor?.created_at || 0) - (lastARumor?.created_at || 0)
  })

  const currentUserPubKey = privateKey ? getPublicKey(privateKey) : null
  const userProfile = currentUserPubKey ? profileMap?.get(currentUserPubKey) : null

  // ------------------------
  // Render
  // ------------------------
  return (
    <Screen style={{ flex: 1 }}>
      <StatusBar translucent backgroundColor="transparent" />
      {privateKey && !showImportModal ? (
        <View style={{ flex: 1, paddingTop: statusBarHeight }}>
          <Tab.Navigator
            tabBar={(props) => (
              <MaterialTopTabBar
                {...props}
                renderTabBarItem={({ key, ...rest }) => (
                  <TabBarItem key={key} {...rest} />
                )}
              />
            )}
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
            style={{ borderColor: colors.primary }}
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
                      <View style={styles.usernameContainer}>
                        <Text style={styles.usernameText}>
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
                                numberOfLines={3}
                                ellipsizeMode="tail"
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

            <Tab.Screen
              name={`Profile: ${userProfile?.name}`}
              component={ContactDetailsScreen}
              initialParams={{
                contactPubkey: getPublicKey(privateKey),
                userPrivateKey: bytesToHex(privateKey),
              }}
            />

            <Tab.Screen name="Contacts">
              {() => (
                <View style={{ height: "100%" }}>
                  <Contacts userPrivateKey={bytesToHex(privateKey)} />
                </View>
              )}
            </Tab.Screen>
          </Tab.Navigator>
        </View>
      ) : (
        <Text>Loading your nostr keys...</Text>
      )}

      <ImportNsecModal
        isActive={showImportModal}
        onCancel={() => setShowImportModal(false)}
        onSubmit={() => resetChat()}
      />
    </Screen>
  )
}
