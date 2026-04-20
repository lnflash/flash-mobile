import * as React from "react"
import { Pressable, View, StyleSheet, Animated } from "react-native"
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

// Tick cadence for the long-press progress animation.
const PROGRESS_TICK_MS = 40
const PROGRESS_INCREMENT = PROGRESS_TICK_MS / FEATURED_PROFILE.LONG_PRESS_DURATION_MS

export const VersionComponent = () => {
  const styles = useStyles()
  const { navigate } = useNavigation<VersionComponentNavigationProp>()
  const { LL } = useI18nContext()

  // Developer screen tap counter (existing behavior)
  const [secretMenuCounter, setSecretMenuCounter] = React.useState(0)

  // Long-press featured-profile entry
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

  const handlePressIn = () => {
    setIsPressing(true)
    let progress = 0

    progressInterval.current = setInterval(() => {
      const prev = progress
      progress += PROGRESS_INCREMENT

      // Light haptic at each ~1/5 of the hold (5 pulses across the full duration).
      if (Math.floor(progress * 5) > Math.floor(prev * 5)) {
        ReactNativeHapticFeedback.trigger("impactLight", {
          enableVibrateFallback: true,
          ignoreAndroidSystemSettings: false,
        })
      }

      Animated.timing(progressAnim, {
        toValue: progress,
        duration: PROGRESS_TICK_MS,
        useNativeDriver: false,
      }).start()

      if (progress >= 1) {
        clearInterval(progressInterval.current!)
        progressInterval.current = null
        setIsPressing(false)

        ReactNativeHapticFeedback.trigger("notificationSuccess", {
          enableVibrateFallback: true,
          ignoreAndroidSystemSettings: false,
        })

        logFeaturedProfileSelected({ discoveryMethod: "long_press" })
        navigate("FeaturedProfileView", { entryPoint: "long_press" })

        progressAnim.setValue(0)
      }
    }, PROGRESS_TICK_MS)
  }

  const handlePressOut = () => {
    setIsPressing(false)

    if (progressInterval.current) {
      clearInterval(progressInterval.current)
      progressInterval.current = null
    }

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start()
  }

  return (
    <Pressable
      style={styles.wrapper}
      onPress={() => setSecretMenuCounter(secretMenuCounter + 1)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      delayLongPress={100}
    >
      <View style={styles.textBox}>
        {isPressing && (
          <View style={styles.progressContainer}>
            <Animated.View
              style={[
                styles.progressRing,
                {
                  borderColor: progressAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [
                      "rgba(0, 255, 0, 0.2)",
                      "rgba(0, 255, 0, 0.5)",
                      "rgba(0, 255, 0, 1)",
                    ],
                  }),
                  transform: [
                    {
                      scale: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.1],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
        )}
        <Text {...testProps("Version Build Text")} style={styles.version}>
          {readableVersion}
          {"\n"}
          {LL.GetStartedScreen.headline()}
        </Text>
      </View>
    </Pressable>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    flex: 1,
    justifyContent: "flex-end",
    marginBottom: 40,
  },
  textBox: {
    alignSelf: "center",
  },
  version: {
    color: colors.grey0,
    fontSize: 18,
    marginTop: 18,
    textAlign: "center",
  },
  progressContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  progressRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    backgroundColor: "transparent",
  },
}))
