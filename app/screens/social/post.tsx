import React, { useState } from "react"
import {
  View,
  TextInput,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
  ScrollView,
  Alert,
} from "react-native"
import { Text, useTheme, makeStyles } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useNavigation } from "@react-navigation/native"
import { PrimaryBtn } from "@app/components/buttons"
import { useI18nContext } from "@app/i18n/i18n-react"

import { nip19, getPublicKey, finalizeEvent, Relay } from "nostr-tools"
import { getSecretKey } from "@app/utils/nostr"

// Replace this with your actual relay URLs
const RELAYS = ["wss://relay.damus.io", "wss://relay.nostr.info"]

type MakeNostrPostNavigationProp = StackNavigationProp<
  RootStackParamList,
  "makeNostrPost"
>

const FIXED_TEXT_LINE_2 = "#introductions"

const MakeNostrPost = ({ privateKey }: { privateKey: string }) => {
  const styles = useStyles()
  const navigation = useNavigation<MakeNostrPostNavigationProp>()
  const { theme } = useTheme()
  const { LL } = useI18nContext()
  const [userText, setUserText] = useState("")
  const [inputHeight, setInputHeight] = useState(40)
  const [loading, setLoading] = useState(false)

  const FIXED_TEXT_LINE_1 = LL.Social.flashAppCredit()

  const onContentSizeChange = (
    event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
  ) => {
    setInputHeight(event.nativeEvent.contentSize.height)
  }

  const publishNostrNote = async (content: string) => {
    try {
      setLoading(true)
      const privateKey = await getSecretKey()
      if (!privateKey) {
        Alert.alert("Your nostr key is not yet set.")
        throw Error("Your nostr key is not yet set.")
      }
      const pubkey = getPublicKey(privateKey)
      const event = {
        kind: 1, // kind 1 = short text note
        pubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content,
      }

      const signedEvent = await finalizeEvent(event, privateKey)

      const relayConnections = RELAYS.map((url) => new Relay(url))
      await Promise.all(relayConnections.map((r) => r.connect()))

      await Promise.all(relayConnections.map((relay) => relay.publish(signedEvent)))

      Alert.alert(LL.Social.notePosted())
      navigation.goBack()
    } catch (e) {
      console.error("Error posting Nostr note:", e)
      Alert.alert(LL.Social.errorPostFailed())
    } finally {
      setLoading(false)
    }
  }

  const onPost = () => {
    const finalText = `${userText}\n\n${FIXED_TEXT_LINE_1}\n${FIXED_TEXT_LINE_2}`
    if (!finalText.trim()) {
      Alert.alert(LL.Social.errorEmptyNote())
      return
    }
    publishNostrNote(finalText)
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      <TextInput
        style={[
          styles.textInput,
          { borderColor: theme.colors.black, height: inputHeight },
        ]}
        multiline
        value={userText}
        onChangeText={setUserText}
        onContentSizeChange={onContentSizeChange}
        textAlignVertical="top"
        placeholder={LL.Social.writeYourNote()}
      />

      <View style={styles.fixedTextContainer}>
        <Text style={[styles.fixedText, { color: theme.colors.grey3 }]}>
          {FIXED_TEXT_LINE_1}
        </Text>
        <Text style={[styles.fixedText, { color: theme.colors.grey3 }]}>
          {FIXED_TEXT_LINE_2}
        </Text>
      </View>

      <PrimaryBtn
        label={loading ? LL.Social.posting() : LL.Social.postButton()}
        onPress={onPost}
        btnStyle={styles.buttonContainer}
        disabled={loading}
      />
    </ScrollView>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.white,
  },
  textInput: {
    borderWidth: 0.2,
    borderRadius: 10,
    padding: 10,
    fontSize: 16,
    marginBottom: 10,
    minHeight: 100,
    backgroundColor: colors.white,
  },
  fixedTextContainer: {
    marginBottom: 20,
  },
  fixedText: {
    fontSize: 14,
  },
  buttonContainer: {
    marginTop: 10,
  },
}))

export default MakeNostrPost
