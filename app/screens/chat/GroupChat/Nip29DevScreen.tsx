import React, { useState } from "react"
import {
  ScrollView,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from "react-native"
import { Text, makeStyles, useTheme, Button } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import Icon from "react-native-vector-icons/Ionicons"
import Clipboard from "@react-native-clipboard/clipboard"
import { nip19 } from "nostr-tools"

import { Screen } from "../../../components/screen"
import type { RootStackParamList } from "../../../navigation/stack-param-lists"
import { useChatContext } from "../chatContext"
import { useNostrGroupChat } from "./GroupChatProvider"
import { usePersistentStateContext } from "../../../store/persistent-state"
import {
  NIP29_DEFAULT_GROUP_ID,
  NIP29_DEFAULT_RELAY_URL,
} from "./constants"
import { toastShow } from "../../../utils/toast"

type FormState = { name: string; about: string; picture: string }

export const Nip29DevScreen: React.FC = () => {
  const styles = useStyles()
  const {
    theme: { colors, mode },
  } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { userPublicKey } = useChatContext()
  const {
    groupId,
    relayUrls,
    isAdmin,
    isMember,
    knownMembers,
    groupMetadata,
    createGroup,
  } = useNostrGroupChat()
  const { persistentState, updateState } = usePersistentStateContext()

  const [form, setForm] = useState<FormState>({
    name: "",
    about: "",
    picture: "",
  })
  const [creating, setCreating] = useState(false)
  const [lastCreatedGroupId, setLastCreatedGroupId] = useState<string | null>(null)

  const npub = userPublicKey ? nip19.npubEncode(userPublicKey) : ""
  const relayUrl = relayUrls[0] || NIP29_DEFAULT_RELAY_URL
  const overrideActive = !!persistentState.nip29GroupIdOverride
  const isDefault =
    groupId === NIP29_DEFAULT_GROUP_ID && relayUrl === NIP29_DEFAULT_RELAY_URL

  const copy = (label: string, value: string) => {
    Clipboard.setString(value)
    toastShow({ message: `${label} copied`, type: "success" })
  }

  const onCreate = async () => {
    if (!form.name.trim()) {
      Alert.alert("Group name required", "Please enter a name for the group.")
      return
    }
    try {
      setCreating(true)
      const newGroupId = await createGroup({
        name: form.name.trim(),
        about: form.about.trim() || undefined,
        picture: form.picture.trim() || undefined,
      })
      setLastCreatedGroupId(newGroupId)
      Alert.alert(
        "Group created",
        `Group ID: ${newGroupId}\n\nUse the 'Switch to this group' button to start chatting in it.`,
      )
    } catch (e: any) {
      Alert.alert("Failed to create group", e?.message || String(e))
    } finally {
      setCreating(false)
    }
  }

  const switchTo = (newGroupId: string) => {
    updateState((s) =>
      s && {
        ...s,
        nip29GroupIdOverride: newGroupId,
        nip29RelayUrlOverride: relayUrl,
      },
    )
    toastShow({ message: "Active group switched", type: "success" })
  }

  const clearOverride = () => {
    Alert.alert(
      "Reset to default group?",
      `This will switch back to ${NIP29_DEFAULT_GROUP_ID}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () =>
            updateState(
              (s) =>
                s && {
                  ...s,
                  nip29GroupIdOverride: undefined,
                  nip29RelayUrlOverride: undefined,
                },
            ),
        },
      ],
    )
  }

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: Platform.OS === "android" ? insets.top : 0 }]}>
        <TouchableOpacity onPress={navigation.goBack} style={styles.backBtn} hitSlop={8}>
          <Icon name="arrow-back-outline" size={24} color={colors.primary3} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>NIP-29 Dev Tools</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Current state */}
        <Text style={styles.sectionTitle}>Current group</Text>
        <View style={styles.card}>
          <CopyRow label="Group ID" value={groupId} onCopy={() => copy("Group ID", groupId)} />
          <CopyRow label="Relay" value={relayUrl} onCopy={() => copy("Relay URL", relayUrl)} />
          <CopyRow
            label="Group name"
            value={groupMetadata.name || "(unknown)"}
            onCopy={
              groupMetadata.name ? () => copy("Group name", groupMetadata.name!) : undefined
            }
          />
          <InfoRow
            label="Your role"
            value={
              !userPublicKey
                ? "no key"
                : isAdmin
                ? "Admin"
                : isMember
                ? "Member"
                : "Outside"
            }
            valueColor={isAdmin ? colors.primary : undefined}
          />
          <InfoRow label="Members" value={String(knownMembers.size)} />
          <InfoRow
            label="Source"
            value={overrideActive ? "override" : "default (hardcoded)"}
          />
          {!isDefault && (
            <View style={{ marginTop: 8 }}>
              <Button
                title="Reset to default group"
                type="outline"
                onPress={clearOverride}
              />
            </View>
          )}
        </View>

        {/* Your identity */}
        <Text style={styles.sectionTitle}>Your identity (use this in another client)</Text>
        <View style={styles.card}>
          {userPublicKey ? (
            <>
              <CopyRow label="npub" value={npub} onCopy={() => copy("npub", npub)} />
              <CopyRow
                label="pubkey (hex)"
                value={userPublicKey}
                onCopy={() => copy("pubkey", userPublicKey)}
              />
              <Text style={[styles.helpText, { color: colors.grey2 }]}>
                To test admin removal of another user, sign in to the same relay from a
                second client (e.g. 0xchat) with a different nsec, then join the active
                group with the Group ID above. Your account here (npub) is the admin.
              </Text>
            </>
          ) : (
            <Text style={styles.helpText}>No user key available</Text>
          )}
        </View>

        {/* Create form */}
        <Text style={styles.sectionTitle}>Create a new test group</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Name *</Text>
          <TextInput
            style={[styles.input, { color: colors.primary3, borderColor: colors.grey4 }]}
            placeholder="Test Group"
            placeholderTextColor={colors.grey3}
            value={form.name}
            onChangeText={(name) => setForm((f) => ({ ...f, name }))}
          />
          <Text style={styles.fieldLabel}>About</Text>
          <TextInput
            style={[
              styles.input,
              { color: colors.primary3, borderColor: colors.grey4, minHeight: 56 },
            ]}
            placeholder="Optional description"
            placeholderTextColor={colors.grey3}
            value={form.about}
            multiline
            onChangeText={(about) => setForm((f) => ({ ...f, about }))}
          />
          <Text style={styles.fieldLabel}>Picture URL</Text>
          <TextInput
            style={[styles.input, { color: colors.primary3, borderColor: colors.grey4 }]}
            placeholder="https://..."
            placeholderTextColor={colors.grey3}
            value={form.picture}
            autoCapitalize="none"
            onChangeText={(picture) => setForm((f) => ({ ...f, picture }))}
          />
          <Button
            title={creating ? "Creating..." : "Create group"}
            onPress={onCreate}
            disabled={creating || !userPublicKey}
            buttonStyle={{ marginTop: 8 }}
          />
        </View>

        {/* Result */}
        {lastCreatedGroupId && (
          <>
            <Text style={styles.sectionTitle}>New group created</Text>
            <View style={[styles.card, { borderColor: colors.primary, borderWidth: 1 }]}>
              <CopyRow
                label="New Group ID"
                value={lastCreatedGroupId}
                onCopy={() => copy("Group ID", lastCreatedGroupId)}
              />
              <CopyRow label="Relay" value={relayUrl} onCopy={() => copy("Relay URL", relayUrl)} />
              <Text style={[styles.helpText, { color: colors.grey2 }]}>
                You are the initial admin of this group. To test as a second user, have
                another client (with its own nsec) connect to the relay above and join
                this Group ID.
              </Text>
              <Button
                title="Switch to this group"
                onPress={() => switchTo(lastCreatedGroupId)}
                buttonStyle={{ marginTop: 8 }}
              />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

const CopyRow: React.FC<{ label: string; value: string; onCopy?: () => void }> = ({
  label,
  value,
  onCopy,
}) => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
      {onCopy && (
        <TouchableOpacity onPress={onCopy} hitSlop={8} style={styles.copyBtn}>
          <Icon name="copy-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  )
}

const InfoRow: React.FC<{ label: string; value: string; valueColor?: string }> = ({
  label,
  value,
  valueColor,
}) => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: valueColor || colors.primary3 }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.grey4,
    backgroundColor: colors.grey5,
  },
  backBtn: {
    padding: 4,
    marginRight: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary3,
    textAlign: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.grey2,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.grey5,
    borderRadius: 12,
    padding: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.grey4,
  },
  rowLabel: {
    fontSize: 12,
    color: colors.grey2,
    width: 100,
  },
  rowValue: {
    flex: 1,
    fontSize: 13,
    color: colors.primary3,
  },
  copyBtn: {
    paddingHorizontal: 8,
  },
  helpText: {
    fontSize: 12,
    marginTop: 10,
    lineHeight: 17,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.grey2,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
}))
