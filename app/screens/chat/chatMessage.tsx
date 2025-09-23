/* eslint-disable camelcase */
/* eslint-disable react-hooks/exhaustive-deps */
import "react-native-get-random-values"
import React, { useEffect, useRef } from "react"
import { View, Text } from "react-native"
import { Icon, makeStyles } from "@rneui/themed"
import { MessageType } from "@flyerhq/react-native-chat-ui"
import { GaloyIcon } from "@app/components/atomic/galoy-icon"
import { useChatContext } from "./chatContext"
import { fetchNostrUsers } from "@app/utils/nostr"
import { Event, nip19, SubCloser } from "nostr-tools"
import { SUPPORT_AGENTS } from "@app/config/supportAgents"

type Props = {
  message: MessageType.Text
  nextMessage: number
  prevMessage: boolean
  showSender?: boolean // ✅ Add this line
}

const USER_COLORS = [
  "#d32f2f", // deep red
  "#388e3c", // dark green
  "#1976d2", // blue
  "#f57c00", // orange
  "#7b1fa2", // purple
  "#0097a7", // cyan
  "#c2185b", // pink
  "#512da8", // indigo
  "#00796b", // teal
  "#689f38", // lime green
  "#5d4037", // brown
  "#455a64", // blue-grey
  "#0288d1", // sky blue
  "#c62828", // crimson
  "#fbc02d", // yellow (deep but readable)
]
function getColorForUserId(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % USER_COLORS.length
  return USER_COLORS[index]
}

export const ChatMessage: React.FC<Props> = ({
  message,
  showSender = false, // ✅ Default to false for backward compatibility
}) => {
  const styles = useStyles()
  const isMounted = useRef(false)

  const { profileMap, addEventToProfiles, poolRef } = useChatContext()

  const isAgent = SUPPORT_AGENTS.has(message.author.id)

  useEffect(() => {
    isMounted.current = true
    if (!showSender) return
    if (profileMap?.get(message.author.id)) return
    if (!poolRef) return
    else {
      fetchNostrUsers([message.author.id], poolRef.current, (event: Event) => {
        addEventToProfiles(event)
      })
    }
    return () => {
      isMounted.current = false
    }
  }, [poolRef])
  return (
    <View style={styles.container}>
      {/* ✅ Optional sender display */}
      {showSender && (
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <Text
            style={{
              ...styles.sender,
              color: getColorForUserId(message.author.id),
            }}
          >
            {profileMap?.get(message.author.id)?.name ||
              nip19.npubEncode(message.author.id).slice(0, 10) ||
              "Unknown"}
          </Text>
          {isAgent && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Support</Text>
            </View>
          )}
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {message.metadata?.errors && (
          <GaloyIcon name="warning" size={20} color="yellow" style={styles.errorIcon} />
        )}
        <Text style={styles.content}>{message.text}</Text>
      </View>
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    borderRadius: 12,
    padding: 10,
    overflow: "hidden",
  },
  sender: {
    fontSize: 12,
    fontWeight: "bold",
    color: colors.grey3,
    marginBottom: 4,
  },
  content: {
    color: colors._black,
  },
  errorIcon: {
    marginRight: 10,
  },
  badge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    marginBottom: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "#1976d2", // blue badge
  },
  badgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
    paddingBottom: 2,
  },
}))
