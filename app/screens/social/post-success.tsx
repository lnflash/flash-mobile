import React, { useMemo } from "react"
import { View, ScrollView, TouchableOpacity, Linking, Image } from "react-native"
import { Text, useTheme, makeStyles } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { useI18nContext } from "@app/i18n/i18n-react"
import Icon from "react-native-vector-icons/Ionicons"
import { useAppSelector } from "@app/store/redux"
import LinearGradient from "react-native-linear-gradient"
import { FeedItem } from "@app/components/nostr-feed/FeedItem"
import { Event, nip19 } from "nostr-tools"
import { bytesToHex } from "@noble/hashes/utils"
import { getSecretKey } from "@app/utils/nostr"

type PostSuccessNavigationProp = StackNavigationProp<RootStackParamList, "postSuccess">
type PostSuccessRouteProp = RouteProp<RootStackParamList, "postSuccess">

const PostSuccess = () => {
  const styles = useStyles()
  const navigation = useNavigation<PostSuccessNavigationProp>()
  const route = useRoute<PostSuccessRouteProp>()
  const { theme } = useTheme()
  const { LL } = useI18nContext()
  const { userData } = useAppSelector((state) => state.user)

  const { postContent, userNpub } = route.params

  const handleViewProfile = async () => {
    const privateKey = await getSecretKey()
    if (!privateKey) return
    const pubkey = extractPubkey(userNpub)
    navigation.navigate("contactDetails", {
      contactPubkey: pubkey,
      userPrivateKey: bytesToHex(privateKey),
    })
  }

  // Extract npub from userNpub string if it's in nip19 format
  const extractPubkey = (npubString: string): string => {
    try {
      if (npubString.startsWith("npub")) {
        const decoded = nip19.decode(npubString)
        return decoded.data as string
      }
      return npubString
    } catch (e) {
      return npubString
    }
  }

  // Create a mock Nostr event for display
  const mockEvent: Event = useMemo(
    () => ({
      id: "mock-id",
      pubkey: extractPubkey(userNpub),
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: postContent,
      sig: "mock-sig",
    }),
    [postContent, userNpub],
  )

  const mockProfile = useMemo(
    () => ({
      name: userData?.username || "Flash User",
      picture: undefined,
      about: undefined,
    }),
    [userData?.username],
  )

  const handlePrimalClick = () => {
    Linking.openURL("https://primal.net")
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.grey5 }]}>
      <LinearGradient
        colors={["#60aa55", "#4a9044", "#357233"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <View style={styles.successIconContainer}>
            <Icon name="checkmark-circle" size={60} color="#FFFFFF" />
          </View>
          <Text style={styles.headerTitle}>{LL.Social.postSuccessTitle()}</Text>
          <Text style={styles.headerSubtitle}>{LL.Social.postSuccessSubtitle()}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Post Preview using FeedItem */}
        <View style={styles.postCardWrapper}>
          <FeedItem event={mockEvent} profile={mockProfile} compact={false} />
        </View>

        {/* Primal CTA Button */}
        <TouchableOpacity
          style={styles.primalButton}
          onPress={handlePrimalClick}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={["#FF6154", "#FE9F41"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primalButtonGradient}
          >
            <View style={styles.primalButtonContent}>
              <View style={styles.primalLogoContainer}>
                <Image
                  source={require("@app/assets/images/primal-logo-large.png")}
                  style={styles.primalLogo}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.primalTextContainer}>
                <Text style={styles.primalTitle}>Explore more on Primal</Text>
                <Text style={styles.primalSubtitle}>
                  Full Nostr experience with feeds, notifications & more
                </Text>
              </View>
              <View style={styles.primalArrowContainer}>
                <Icon name="arrow-forward" size={22} color="#FFFFFF" />
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* View Profile Button */}
        <TouchableOpacity
          style={[styles.viewProfileButton, { backgroundColor: theme.colors.grey5 }]}
          onPress={handleViewProfile}
          activeOpacity={0.8}
        >
          <Icon name="person-outline" size={20} color={theme.colors.primary} />
          <Text style={[styles.viewProfileText, { color: theme.colors.black }]}>
            Show Recent Posts
          </Text>
          <Icon name="chevron-forward" size={20} color={theme.colors.grey3} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate("Primary", { screen: "Home" })}
          style={styles.backHomeButton}
        >
          <Text style={[styles.backHomeText, { color: theme.colors.grey3 }]}>
            {LL.common.backHome()}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
  },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  headerContent: {
    alignItems: "center",
  },
  successIconContainer: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 30,
  },
  postCardWrapper: {
    marginBottom: 24,
  },
  primalButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  primalButtonGradient: {
    borderRadius: 16,
  },
  primalButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    gap: 14,
  },
  primalLogoContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  primalLogo: {
    width: 50,
    height: 50,
    borderRadius: 20,
  },
  primalTextContainer: {
    flex: 1,
  },
  primalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  primalSubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.95)",
    lineHeight: 18,
  },
  primalArrowContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  viewProfileButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  viewProfileText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 12,
  },
  backHomeButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  backHomeText: {
    fontSize: 16,
    textDecorationLine: "underline",
  },
}))

export default PostSuccess
