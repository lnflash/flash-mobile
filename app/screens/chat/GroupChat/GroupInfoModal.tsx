import React from "react"
import {
  Modal,
  View,
  Image,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import Icon from "react-native-vector-icons/Ionicons"
import { nip19 } from "nostr-tools"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const DEFAULT_AVATAR =
  "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg"

type Props = {
  visible: boolean
  onClose: () => void
  groupMetadata: { name?: string; about?: string; picture?: string }
  adminList: string[]
  memberCount: number
  profileMap: Map<string, any>
  isAdmin: boolean
}

export const GroupInfoModal: React.FC<Props> = ({
  visible,
  onClose,
  groupMetadata,
  adminList,
  memberCount,
  profileMap,
  isAdmin,
}) => {
  const styles = useStyles()
  const { theme: { colors } } = useTheme()
  const insets = useSafeAreaInsets()

  const getDisplayName = (pubkey: string) => {
    const p = profileMap.get(pubkey)
    return p?.name || p?.username || nip19.npubEncode(pubkey).slice(0, 10) + "…"
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {/* Handle bar */}
        <View style={styles.handle} />

        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
          <Icon name="close" size={22} color={colors.grey2} />
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Group avatar + name */}
          <View style={styles.hero}>
            <Image
              source={
                groupMetadata.picture
                  ? { uri: groupMetadata.picture }
                  : require("../../../assets/images/Flash-Mascot.png")
              }
              style={[styles.avatar, { borderColor: colors.primary }]}
            />
            <Text style={styles.groupName}>{groupMetadata.name || "Support Group"}</Text>
            {groupMetadata.about ? (
              <Text style={styles.groupAbout}>{groupMetadata.about}</Text>
            ) : null}
            <View style={styles.memberBadge}>
              <Icon name="people-outline" size={14} color={colors.primary} />
              <Text style={[styles.memberCount, { color: colors.primary }]}>
                {memberCount} {memberCount === 1 ? "member" : "members"}
              </Text>
            </View>
            {isAdmin && (
              <View style={[styles.adminBadge, { backgroundColor: colors.primary + "22" }]}>
                <Icon name="shield-checkmark-outline" size={13} color={colors.primary} />
                <Text style={[styles.adminBadgeText, { color: colors.primary }]}>You are an admin</Text>
              </View>
            )}
          </View>

          {/* Admins section */}
          {adminList.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Admins</Text>
              {adminList.map((pubkey) => {
                const profile = profileMap.get(pubkey)
                return (
                  <View key={pubkey} style={styles.memberRow}>
                    <Image
                      source={{ uri: profile?.picture || DEFAULT_AVATAR }}
                      style={styles.memberAvatar}
                    />
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{getDisplayName(pubkey)}</Text>
                      {profile?.nip05 && (
                        <Text style={styles.memberNip05}>{profile.nip05}</Text>
                      )}
                    </View>
                    <View style={[styles.adminTag, { backgroundColor: colors.primary + "22" }]}>
                      <Icon name="shield-checkmark-outline" size={12} color={colors.primary} />
                      <Text style={[styles.adminTagText, { color: colors.primary }]}>Admin</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          )}
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
  hero: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.grey4,
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    marginBottom: 12,
  },
  groupName: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary3,
    textAlign: "center",
  },
  groupAbout: {
    fontSize: 14,
    color: colors.grey2,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  memberBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
  },
  memberCount: {
    fontSize: 13,
    fontWeight: "500",
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  adminBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.grey2,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
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
}))
