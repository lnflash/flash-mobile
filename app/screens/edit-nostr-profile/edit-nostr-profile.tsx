import React, { useEffect, useState } from "react"
import { View, Text, Button } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { Event, getPublicKey, nip19 } from "nostr-tools"
import { fetchNostrUsers, getSecretKey } from "@app/utils/nostr"
import { useChatContext } from "../nip17-chat/chatContext"
import { EditProfileUI } from "./edit-profile-ui"

const EditNostrProfileScreen = () => {
  const navigation = useNavigation()
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null)
  const [profileEvent, setProfileEvent] = useState<Event | null>(null)
  const { poolRef } = useChatContext()

  useEffect(() => {
    const initialize = async () => {
      let secret = await getSecretKey()
      if (secret) {
        setSecretKey(secret)
        if (poolRef)
          fetchNostrUsers(
            [getPublicKey(secret)],
            poolRef.current,
            (event: Event, closer) => {
              setProfileEvent(event)
              closer.close()
            },
          )
      }
    }
    initialize()
  }, [poolRef])

  return (
    <View>
      {/* Add your form or profile fields here */}
      <EditProfileUI profileEvent={profileEvent} />
    </View>
  )
}

export default EditNostrProfileScreen
