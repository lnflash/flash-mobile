/* eslint-disable camelcase */
/* eslint-disable react-hooks/exhaustive-deps */
import "react-native-get-random-values"
import React, { useEffect, useRef } from "react"
import { View, Text } from "react-native"
import { makeStyles } from "@rneui/themed"

type Props = {
  recipientId: `npub1${string}`
  message: { id: string; author: { id: string }; text: string }
  nextMessage: number
  prevMessage: boolean
}

export const ChatMessage: React.FC<Props> = ({ message, recipientId }) => {
  const styles = useStyles()
  const isMounted = useRef(false)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  return (
    <View style={styles.container}>
      <Text
        style={{
          ...styles.content,
          color: recipientId !== message.author.id ? "#ffffff" : "#000000",
        }}
      >
        {message.text}
      </Text>
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    borderRadius: 12,
    padding: 10,
    overflow: "hidden",
  },
  content: {
    color: colors.black,
  },
}))
