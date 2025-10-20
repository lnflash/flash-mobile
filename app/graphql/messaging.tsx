import { useEffect } from "react"

import { useApolloClient } from "@apollo/client"
import { getMessaging } from "@react-native-firebase/messaging"

import { HomeAuthedDocument } from "./generated"

// refetch when we receive an OS notification
export const MessagingContainer = () => {
  const client = useApolloClient()

  useEffect(() => {
    const unsubscribe = getMessaging().onMessage(async (_remoteMessage) => {
      client.refetchQueries({ include: [HomeAuthedDocument] })
    })

    return unsubscribe
  }, [client])

  return null
}
