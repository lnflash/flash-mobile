/* eslint-disable camelcase */
/* eslint-disable react-hooks/exhaustive-deps */
import "react-native-get-random-values"
import React, { useEffect, useCallback, useRef } from "react"
import { View, Text } from "react-native"
import { makeStyles } from "@rneui/themed"
import NDK, { NDKEvent, NDKPrivateKeySigner, NDKUser } from "@nostr-dev-kit/ndk"
import { MessageType } from "@flyerhq/react-native-chat-ui"
import { encrypt, decrypt } from "@app/utils/crypto"
import { nip19 } from "nostr-tools"
import useNostrProfile from "@app/hooks/use-nostr-profile"

type Props = {
  recipientId: `npub1${string}`
  message: MessageType.Text
  nextMessage: number
  prevMessage: boolean
}

type secureKeyPair = {
  seckey?: string
  pubkey: string
}

let decryptedMessage: string

// Connect to nostr
const ndk = new NDK({
  explicitRelayUrls: [
    "wss://nos.lol",
    "wss://no.str.cr",
    "wss://relay.damus.io",
    "wss://realy.primal.net",
    "wss://nostr.mom",
    "wss://nostr.pleb.network",
  ],
})

export const ChatMessage: React.FC<Props> = ({ message }) => {
  const { nostrSecretKey: senderSecretKey, nostrPubKey: senderPubKey } = useNostrProfile()
  const styles = useStyles()
  const isMounted = useRef(false)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    isMounted.current = true
    if (
      message.text &&
      senderSecretKey &&
      nip19.decode(senderSecretKey).data.toString()
    ) {
      const senderSec: secureKeyPair = {
        seckey: nip19.decode(senderSecretKey).data.toString(),
        pubkey: senderPubKey,
      }
    } else {
      console.log("Waiting for event to load...")
    }
    return () => {
      isMounted.current = false
    }
  }, [message.text, senderSecretKey, senderPubKey])

  return (
    <View style={styles.container}>
      <View style={styles.container}>
        <Text style={styles.content}>{message.text}</Text>
      </View>
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    backgroundColor: colors.grey5,
    borderColor: colors.grey4,
    borderWidth: 1,
    borderRadius: 12,
    padding: 1,
    overflow: "hidden",
  },
  content: {
    color: colors.grey1,
  },
}))
