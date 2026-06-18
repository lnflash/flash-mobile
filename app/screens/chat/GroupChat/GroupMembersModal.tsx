import React, { useState } from "react"
import {
  Modal,
  View,
  Image,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Alert,
} from "react-native"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import Icon from "react-native-vector-icons/Ionicons"
import { nip19 } from "nostr-tools"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useNostrGroupChat } from "./GroupChatProvider"
import { useChatContext } from "../chatContext"
import { UserSearchBar } from "../UserSearchBar"

const DEFAULT_AVATAR =
  "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg"

type Props = {
  visible: boolean
  onClose: () => void
  profileMap: Map<string, any>
}

export const GroupMembersModal: React.FC<Props> = ({ visible, onClose, profileMap }) => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  const insets = useSafeAreaInsets()
  const { knownMembers, roleMap, isAdmin, isKing, addMember, removeMember } = useNostrGroupChat()
  const { userPublicKey } = useChatContext()

  // Results from the shared UserSearchBar — already resolved (npub / NIP-05 alias
  // / bare Flash username) to a pubkey in `item.id`.
  const [searchedUsers, setSearchedUsers] = useState<Chat[]>([])
  const [addingId, setAddingId] = useState<string | null>(null)

  const onAddUser = async (item: Chat) => {
    try {
      setAddingId(item.id)
      await addMember(item.id)
      setSearchedUsers([])
      Alert.alert("Member added", "The user has been added to the group.")
    } catch (e: any) {
      Alert.alert("Failed to add member", e?.message || String(e))
    } finally {
      setAddingId(null)
    }
  }

  const onRemoveMember = (pubkey: string) => {
    Alert.alert("Remove member", "Remove this user from the group?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeMember(pubkey) },
    ])
  }

  const getDisplayName = (pubkey: string) => {
    const p = profileMap.get(pubkey)
    return p?.name || p?.username || nip19.npubEncode(pubkey).slice(0, 10) + "…"
  }

  // Sort members: admins (king/bishop) first, then by name.
  const members = Array.from(knownMembers).sort((a, b) => {
    const aAdmin = roleMap.has(a) ? 0 : 1
    const bAdmin = roleMap.has(b) ? 0 : 1
    if (aAdmin !== bAdmin) return aAdmin - bAdmin
    return getDisplayName(a).localeCompare(getDisplayName(b))
  })

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
          <Icon name="close" size={22} color={colors.grey2} />
        </TouchableOpacity>

        <Text style={styles.title}>
          {members.length} {members.length === 1 ? "member" : "members"}
        </Text>

        {/* Search by Flash username / npub to add a member (admins only) */}
        {isAdmin && <UserSearchBar setSearchedUsers={setSearchedUsers} />}

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Search results to add */}
          {isAdmin &&
            searchedUsers.map((item) => {
              const alreadyMember = knownMembers.has(item.id)
              const name =
                item.username || item.name || item.lud16 || nip19.npubEncode(item.id).slice(0, 12) + "…"
              return (
                <View key={`search-${item.id}`} style={styles.memberRow}>
                  <Image
                    source={{ uri: item.picture || DEFAULT_AVATAR }}
                    style={styles.memberAvatar}
                  />
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{name}</Text>
                  </View>
                  {alreadyMember ? (
                    <Text style={styles.alreadyMember}>Member</Text>
                  ) : addingId === item.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={() => onAddUser(item)}
                      hitSlop={8}
                    >
                      <Icon name="person-add-outline" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}

          {/* Current members */}
          {members.map((pubkey) => {
            const profile = profileMap.get(pubkey)
            const roles = roleMap.get(pubkey) ?? []
            const isSelf = pubkey === userPublicKey
            return (
              <View key={pubkey} style={styles.memberRow}>
                <Image
                  source={{ uri: profile?.picture || DEFAULT_AVATAR }}
                  style={styles.memberAvatar}
                />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {getDisplayName(pubkey)}
                    {isSelf ? " (you)" : ""}
                  </Text>
                  {profile?.nip05 && <Text style={styles.memberNip05}>{profile.nip05}</Text>}
                </View>
                {roles.length > 0 && (
                  <View style={[styles.adminTag, { backgroundColor: colors.primary + "22" }]}>
                    <Icon name="shield-checkmark-outline" size={12} color={colors.primary} />
                    <Text
                      style={[
                        styles.adminTagText,
                        { color: colors.primary, textTransform: "capitalize" },
                      ]}
                    >
                      {roles.join(", ")}
                    </Text>
                  </View>
                )}
                {isKing && !isSelf && (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => onRemoveMember(pubkey)}
                    hitSlop={8}
                  >
                    <Icon name="person-remove-outline" size={18} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>
            )
          })}
        </ScrollView>
      </View>
    </Modal>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: colors.grey5,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: "75%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.grey4,
    alignSelf: "center",
    marginBottom: 12,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 20,
    zIndex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.primary3,
    marginBottom: 8,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.grey4,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.primary3,
  },
  memberNip05: {
    fontSize: 12,
    color: colors.grey2,
    marginTop: 1,
  },
  adminTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  adminTagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  addBtn: {
    padding: 6,
    marginLeft: 8,
  },
  removeBtn: {
    padding: 6,
    marginLeft: 8,
  },
  alreadyMember: {
    fontSize: 12,
    color: colors.grey2,
    marginLeft: 8,
  },
}))
