import React, { useState } from "react"
import {
  Modal,
  View,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
} from "react-native"
import { Text, makeStyles, useTheme, Button } from "@rneui/themed"
import Icon from "react-native-vector-icons/Ionicons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useChatContext } from "../chatContext"
import { NIP29_DEFAULT_RELAY_URL } from "./constants"
import { createNip29Group } from "./nip29Actions"

type Props = {
  visible: boolean
  onClose: () => void
  // Called with the new group id once creation succeeds.
  onCreated: (groupId: string) => void
  relayUrls?: string[]
}

export const CreateGroupModal: React.FC<Props> = ({
  visible,
  onClose,
  onCreated,
  relayUrls = [NIP29_DEFAULT_RELAY_URL],
}) => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  const insets = useSafeAreaInsets()
  const { userPublicKey } = useChatContext()

  const [form, setForm] = useState({ name: "", about: "", picture: "" })
  const [creating, setCreating] = useState(false)

  const reset = () => setForm({ name: "", about: "", picture: "" })

  const onCreate = async () => {
    if (!userPublicKey) {
      Alert.alert("No account", "A Nostr key is required to create a group.")
      return
    }
    if (!form.name.trim()) {
      Alert.alert("Group name required", "Please enter a name for the group.")
      return
    }
    try {
      setCreating(true)
      const newGroupId = await createNip29Group(userPublicKey, relayUrls, {
        name: form.name.trim(),
        about: form.about.trim() || undefined,
        picture: form.picture.trim() || undefined,
      })
      reset()
      onCreated(newGroupId)
    } catch (e: any) {
      Alert.alert("Failed to create group", e?.message || String(e))
    } finally {
      setCreating(false)
    }
  }

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

        <Text style={styles.title}>Create a group</Text>

        <Text style={styles.fieldLabel}>Name *</Text>
        <TextInput
          style={[styles.input, { color: colors.primary3, borderColor: colors.grey4 }]}
          placeholder="My group"
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
          autoCapitalize="none"
          value={form.picture}
          onChangeText={(picture) => setForm((f) => ({ ...f, picture }))}
        />
        <Button
          title={creating ? "Creating..." : "Create group"}
          onPress={onCreate}
          disabled={creating || !userPublicKey}
          buttonStyle={{ marginTop: 16 }}
        />
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
  fieldLabel: {
    fontSize: 12,
    color: colors.grey2,
    marginTop: 12,
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
