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

// assets
import PosTerminal from "@app/assets/illustrations/pos-terminal.svg"
import Exchange from "@app/assets/illustrations/dollar-bitcoin-exchange.svg"
import Present from "@app/assets/illustrations/present-gift.svg"

// Constants
const DOMAIN_MAP = {
  blink: "@blink.sv",
  flash: "@flashapp.me",
} as const

const Icons = {
  pos: PosTerminal,
  exchange: Exchange,
  present: Present,
}

const SERVICE_BADGES = [
  {
    key: "acceptsFlash",
    icon: "pos",
    label: "✅ Flash Payments",
    description: "Accepts instant Bitcoin payments via Flash app and Flashcards",
  },
  {
    key: "redeemTopup",
    icon: "exchange",
    label: "🔄 Cash Services",
    description: "Top up or redeem funds from Flash Cash wallets",
  },
  {
    key: "hasRewards",
    icon: "present",
    label: "🎁 Loyalty Rewards",
    description: "Earn points on purchases, redeemable at any participating location",
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
}

const ServiceBadge: React.FC<{
  isActive: boolean
  icon: string
}> = memo(({ isActive, icon }) => {
  const CustomIcon = Icons[icon as keyof typeof Icons]
  if (isActive) return <CustomIcon width={50} height={50} />
  return null
})

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
          <View style={styles.menu}>
            <Icon name="menu-outline" size={30} />
          </View>
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Text type="h1" color={colors.white}>
                {firstLetter}
              </Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Icon name="checkmark-circle" size={24} color={colors.green} />
            </View>
          </View>
          <Text type="p1" bold style={{ marginBottom: 5 }}>
            {item.mapInfo.title}
          </Text>
          <Text type="p3" color={colors.primary}>
            Provided services
          </Text>
          <View style={styles.badgesContainer}>
            {SERVICE_BADGES.map((badge) => (
              <ServiceBadge
                key={badge.key}
                isActive={item[badge.key] !== false}
                icon={badge.icon}
              />
            ))}
          </View>
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
      const setServiceDefaults = (item: any) => ({
        ...item,
        acceptsFlash: item.acceptsFlash ?? true,
        redeemTopup: item.redeemTopup ?? false,
        hasRewards: item.hasRewards ?? false,
      })

      const blinkMarkers =
        blinkData?.businessMapMarkers?.map((item: any) =>
          setServiceDefaults({
            ...item,
            source: "blink" as const,
          }),
        ) ?? []

      const flashMarkers =
        flashData?.businessMapMarkers?.map((item: any) =>
          setServiceDefaults({
            ...item,
            source: "flash" as const,
          }),
        ) ?? []

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
  menu: {
    position: "absolute",
    right: 10,
    top: 10,
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
  badgesContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    gap: 20,
  },
}))
