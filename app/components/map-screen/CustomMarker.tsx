/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/display-name */
import React, { memo, useCallback, useMemo } from "react"
import { Alert, Linking, View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { Callout, Marker } from "react-native-maps"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import Icon from "react-native-vector-icons/Ionicons"

// Constants
const DOMAIN_MAP = {
  blink: "@blink.sv",
  flash: "@flashapp.me",
} as const

const SERVICE_BADGES = [
  {
    key: "acceptsFlash",
    icon: "checkmark-circle",
    activeStyle: "acceptedBadgeIcon",
    label: "✅ Flash Payments",
    description: "Accepts instant Bitcoin payments via Flash app and Flashcards",
  },
  {
    key: "redeemTopup",
    icon: "refresh-circle",
    activeStyle: "redeemBadgeIcon",
    label: "🔄 Cash Services",
    description: "Top up or redeem funds from Flash Cash wallets",
  },
  {
    key: "hasRewards",
    icon: "gift",
    activeStyle: "rewardsBadgeIcon",
    label: "🎁 Loyalty Rewards",
    description: "Earn points on purchases, redeemable at any participating location",
  },
  {
    key: "sellsBitcoin",
    icon: "logo-bitcoin",
    activeStyle: "bitcoinBadgeIcon",
    label: "₿ Bitcoin Exchange",
    description: "Buy and sell Bitcoin directly at this location",
  },
] as const

type Props = {
  blinkData: any
  flashData: any
}

type MarkerItem = {
  username: string
  source: "blink" | "flash"
  mapInfo: {
    title: string
    coordinates: {
      latitude: number
      longitude: number
    }
  }
  acceptsFlash?: boolean
  redeemTopup?: boolean
  hasRewards?: boolean
  sellsBitcoin?: boolean
}

// Service Badge Component
const ServiceBadge: React.FC<{
  isActive: boolean
  icon: string
  activeColor: string
  inactiveColor: string
  styles: any
}> = memo(({ isActive, icon, activeColor, inactiveColor, styles }) => (
  <View style={styles.badgeWrapper}>
    <View style={[styles.badge, !isActive && styles.badgeDisabled]}>
      <Icon name={icon} size={20} color={isActive ? activeColor : inactiveColor} />
    </View>
  </View>
))

// Business Marker Component
const BusinessMarker: React.FC<{
  item: MarkerItem
  index: number
  styles: any
  colors: any
  isAuthed: boolean
  LL: any
  navigation: StackNavigationProp<RootStackParamList, "Primary">
}> = memo(({ item, index, styles, colors, isAuthed, LL, navigation }) => {
  const key = `${item.username}-${item.mapInfo.title}-${index}`

  // Navigation handlers
  const handlePayment = useCallback(() => {
    const domain = DOMAIN_MAP[item.source]
    const usernameWithDomain = `${item.username}${domain}`

    if (isAuthed && item?.username) {
      navigation.navigate("sendBitcoinDestination", {
        username: usernameWithDomain,
      })
    } else {
      navigation.navigate("phoneFlow")
    }
  }, [item.source, item.username, isAuthed, navigation])

  const handleDirections = useCallback(() => {
    if (item.mapInfo.coordinates) {
      const { latitude, longitude } = item.mapInfo.coordinates
      const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
      Linking.openURL(url)
    }
  }, [item.mapInfo.coordinates])

  // Service info handler
  const handleViewServices = useCallback(() => {
    const activeServices = SERVICE_BADGES.filter(
      (badge) => item[badge.key] !== false,
    ).map((badge) => `${badge.label}\n${badge.description}`)

    const serviceCount = activeServices.length
    const subtitle =
      serviceCount === 1
        ? "This location offers 1 service:"
        : `This location offers ${serviceCount} services:`

    const message =
      activeServices.length > 0
        ? `${subtitle}\n\n${activeServices.join("\n\n")}`
        : "No service information is currently available for this location."

    Alert.alert(item.mapInfo.title, message, [{ text: "Got it", style: "default" }], {
      cancelable: true,
    })
  }, [item])

  // Main options handler
  const handleShowOptions = useCallback(() => {
    Alert.alert(
      item.mapInfo.title,
      "Choose an action",
      [
        { text: LL.MapScreen.payBusiness(), onPress: handlePayment },
        { text: LL.MapScreen.getDirections(), onPress: handleDirections },
        { text: "View Services", onPress: handleViewServices },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    )
  }, [item.mapInfo.title, LL, handlePayment, handleDirections, handleViewServices])

  const firstLetter = item.mapInfo.title.charAt(0).toUpperCase()

  return (
    <Marker
      coordinate={item.mapInfo.coordinates}
      key={key}
      pinColor={colors._orange}
      tracksViewChanges={false}
    >
      <Callout onPress={handleShowOptions}>
        <View style={styles.calloutContainer}>
          {/* Logo/Avatar Circle with Verification Badge */}
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>{firstLetter}</Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Icon
                name="checkmark-circle"
                size={24}
                color={styles.verifiedBadgeIcon.color}
              />
            </View>
          </View>

          {/* Business Name */}
          <Text style={styles.title}>{item.mapInfo.title}</Text>

          {/* Feature Badges */}
          <View style={styles.badgesContainer}>
            {SERVICE_BADGES.map((badge) => (
              <ServiceBadge
                key={badge.key}
                isActive={item[badge.key] !== false}
                icon={badge.icon}
                activeColor={styles[badge.activeStyle].color}
                inactiveColor={styles.disabledBadgeIcon.color}
                styles={styles}
              />
            ))}
          </View>

          {/* Tap for options text */}
          <Text style={styles.tapText}>Tap for options</Text>
        </View>
      </Callout>
    </Marker>
  )
})

export const CustomMarker: React.FC<Props> = memo(
  ({ blinkData, flashData }) => {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList, "Primary">>()
    const styles = useStyles()
    const isAuthed = useIsAuthed()
    const { LL } = useI18nContext()
    const { colors } = useTheme().theme

    // Combine and transform marker data
    const markerData = useMemo(() => {
      const blinkMarkers =
        blinkData?.businessMapMarkers?.map((item: any) => ({
          ...item,
          source: "blink" as const,
        })) ?? []

      const flashMarkers =
        flashData?.businessMapMarkers?.map((item: any) => ({
          ...item,
          source: "flash" as const,
        })) ?? []

      return [...blinkMarkers, ...flashMarkers].filter(Boolean)
    }, [blinkData, flashData])

    // Generate markers
    const markers = useMemo(
      () =>
        markerData.map((item: MarkerItem, index: number) => (
          <BusinessMarker
            key={`${item.username}-${item.mapInfo.title}-${index}`}
            item={item}
            index={index}
            styles={styles}
            colors={colors}
            isAuthed={isAuthed}
            LL={LL}
            navigation={navigation}
          />
        )),
      [markerData, styles, colors, isAuthed, LL, navigation],
    )

    return markers
  },
  (prevProps, nextProps) => {
    return (
      prevProps.flashData === nextProps.flashData &&
      prevProps.blinkData === nextProps.blinkData
    )
  },
)

const useStyles = makeStyles(({ colors }) => ({
  calloutContainer: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  logoContainer: {
    marginBottom: 12,
    position: "relative",
  },
  logoCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors._orange,
    justifyContent: "center",
    alignItems: "center",
  },
  verifiedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: "white",
    borderRadius: 12,
  },
  verifiedBadgeIcon: {
    color: "#4CAF50",
  },
  logoText: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
  },
  title: {
    color: colors._darkGrey,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  tapText: {
    color: colors.primary,
    fontSize: 14,
    marginTop: 4,
    fontStyle: "italic",
  },
  badgesContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 12,
    gap: 8,
  },
  badgeWrapper: {
    padding: 2,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  badgeDisabled: {
    opacity: 0.3,
  },
  acceptedBadgeIcon: {
    color: "#4CAF50",
  },
  redeemBadgeIcon: {
    color: "#FF5722",
  },
  rewardsBadgeIcon: {
    color: "#FFC107",
  },
  bitcoinBadgeIcon: {
    color: "#F7931A",
  },
  disabledBadgeIcon: {
    color: "#999",
  },
}))
