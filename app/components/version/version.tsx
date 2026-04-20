import * as React from "react"
import { Pressable } from "react-native"
import { Text, makeStyles } from "@rneui/themed"
import DeviceInfo from "react-native-device-info"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { RootStackParamList } from "../../navigation/stack-param-lists"
import { useI18nContext } from "@app/i18n/i18n-react"
import { testProps } from "../../utils/testProps"
import ReactNativeHapticFeedback from "react-native-haptic-feedback"

// Featured profile entry point (long-press on version)
import { FEATURED_PROFILE } from "@app/constants/featured-profile"
import { logFeaturedProfileSelected } from "@app/utils/analytics"

type VersionComponentNavigationProp = StackNavigationProp<
  RootStackParamList,
  "getStarted" | "settings"
>

export const VersionComponent = () => {
  const styles = useStyles()
  const { navigate } = useNavigation<VersionComponentNavigationProp>()
  const { LL } = useI18nContext()
  const [secretMenuCounter, setSecretMenuCounter] = React.useState(0)

  // Long-press featured-profile entry
  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null)
  const progressInterval = React.useRef<NodeJS.Timeout | null>(null)
  const progressAnim = React.useRef(new Animated.Value(0)).current
  const [isPressing, setIsPressing] = React.useState(false)

  // Existing developer screen behavior
  React.useEffect(() => {
    if (secretMenuCounter > 2) {
      navigate("developerScreen")
      setSecretMenuCounter(0)
    }
  }, [navigate, secretMenuCounter])

  const readableVersion = DeviceInfo.getReadableVersion()

  // Long-press handlers for featured-profile entry
  const handlePressIn = () => {
    setIsPressing(true)
    let progress = 0
    
    // Progressive haptic feedback during hold
    progressInterval.current = setInterval(() => {
      progress += 0.04 // 5 seconds = 125 intervals at 40ms
      
      // Light haptic every 1 second (25 intervals)
      if (Math.floor(progress * 25) > Math.floor((progress - 0.04) * 25)) {
        ReactNativeHapticFeedback.trigger('impactLight', {
          enableVibrateFallback: true,
          ignoreAndroidSystemSettings: false,
        })
      }
      
      // Animate progress
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 40,
        useNativeDriver: false,
      }).start()
      
      if (progress >= 1) {
        // Success — open the featured profile view
        clearInterval(progressInterval.current!)
        progressInterval.current = null
        setIsPressing(false)

        // Strong haptic on success
        ReactNativeHapticFeedback.trigger('notificationSuccess', {
          enableVibrateFallback: true,
          ignoreAndroidSystemSettings: false,
        })

        // Analytics
        logFeaturedProfileSelected({ discoveryMethod: 'long_press' })

        // Navigate
        navigate("FeaturedProfileView", { entryPoint: 'long_press' })

        // Reset progress
        progressAnim.setValue(0)
      }
    }, 40)
  }

  const handlePressOut = () => {
    setIsPressing(false)
    
    // Clear the interval
    if (progressInterval.current) {
      clearInterval(progressInterval.current)
      progressInterval.current = null
    }
    
    // Animate progress back to 0
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start()
  }

  // Calculate progress ring circumference
  const size = 80
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI

  return (
    <Pressable
      style={styles.wrapper}
      onPress={() => setSecretMenuCounter(secretMenuCounter + 1)}
    >
      <Text {...testProps("Version Build Text")} style={styles.version}>
        {readableVersion}
        {"\n"}
        {LL.GetStartedScreen.headline()}
      </Text>
    </Pressable>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    flex: 1,
    justifyContent: "flex-end",
    marginBottom: 40,
  },
  version: {
    color: colors.grey0,
    fontSize: 18,
    marginTop: 18,
    textAlign: "center",
  },
}))
