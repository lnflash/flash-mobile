import React, { useState, useEffect, useCallback } from "react"
import { View, FlatList, RefreshControl, ActivityIndicator } from "react-native"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { Event } from "nostr-tools"
import { pool } from "@app/utils/nostr/pool"
import { FeedItem } from "./FeedItem"

const RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.snort.social",
]

type Profile = {
  name?: string
  picture?: string
  about?: string
}

type NostrFeedProps = {
  userPubkey?: string
}

export const NostrFeed: React.FC<NostrFeedProps> = ({ userPubkey }) => {
  const styles = useStyles()
  const { theme } = useTheme()
  const [events, setEvents] = useState<Event[]>([])
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [since, setSince] = useState(Math.floor(Date.now() / 1000) - 86400)

  const fetchProfiles = useCallback(async (pubkeys: string[]) => {
    try {
      const uniquePubkeys = [...new Set(pubkeys)]
      const sub = pool.subscribeMany(
        RELAYS,
        [
          {
            kinds: [0],
            authors: uniquePubkeys,
          },
        ],
        {
          onevent(event) {
            try {
              const profile = JSON.parse(event.content)
              setProfiles((prev) => new Map(prev).set(event.pubkey, profile))
            } catch (e) {
              console.log("Error parsing profile:", e)
            }
          },
          oneose() {
            sub.close()
          },
        },
      )
    } catch (error) {
      console.error("Error fetching profiles:", error)
    }
  }, [])

  const fetchEvents = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true)
          setSince(Math.floor(Date.now() / 1000))
        } else {
          setLoading(true)
        }

        const fetchedEvents: Event[] = []

        const filter: any = {
          kinds: [1],
          limit: 50,
          since: isRefresh ? Math.floor(Date.now() / 1000) - 3600 : since,
        }

        if (userPubkey) {
          filter.authors = [userPubkey]
        }

        const sub = pool.subscribeMany(RELAYS, [filter], {
          onevent(event) {
            if (!fetchedEvents.find((e) => e.id === event.id)) {
              fetchedEvents.push(event)
            }
          },
          oneose() {
            fetchedEvents.sort((a, b) => b.created_at - a.created_at)

            if (isRefresh) {
              setEvents(fetchedEvents)
            } else {
              setEvents((prev) => {
                const combined = [...fetchedEvents, ...prev]
                const unique = combined.filter(
                  (event, index, self) => index === self.findIndex((e) => e.id === event.id),
                )
                return unique.sort((a, b) => b.created_at - a.created_at)
              })
            }

            const pubkeys = fetchedEvents.map((e) => e.pubkey)
            if (pubkeys.length > 0) {
              fetchProfiles(pubkeys)
            }

            sub.close()
            setLoading(false)
            setRefreshing(false)
          },
        })

        setTimeout(() => {
          sub.close()
          setLoading(false)
          setRefreshing(false)
        }, 5000)
      } catch (error) {
        console.error("Error fetching events:", error)
        setLoading(false)
        setRefreshing(false)
      }
    },
    [since, fetchProfiles, userPubkey],
  )

  useEffect(() => {
    fetchEvents()
  }, [])

  const onRefresh = () => {
    fetchEvents(true)
  }

  const renderItem = ({ item }: { item: Event }) => (
    <FeedItem event={item} profile={profiles.get(item.pubkey)} />
  )

  const ListEmptyComponent = () => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No posts yet</Text>
        <Text style={[styles.emptySubtext, { color: theme.colors.grey3 }]}>
          Pull to refresh
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={events.length === 0 ? styles.emptyList : undefined}
      />
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    backgroundColor: colors.grey5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.black,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
  },
}))