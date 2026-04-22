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

// Number of haptic pulses across the full hold (light "ticks" at each 1/N of the
// duration, giving the user a sense of progress).
const HAPTIC_PULSE_COUNT = 5

// Reset animation duration when the user lifts their finger early.
const RESET_ANIM_MS = 200

export const VersionComponent = () => {
  const styles = useStyles()
  const { navigate } = useNavigation<VersionComponentNavigationProp>()
  const { LL } = useI18nContext()

  // Developer screen tap counter (existing behavior)
  const [secretMenuCounter, setSecretMenuCounter] = React.useState(0)

  // Long-press featured-profile entry
  const progressAnim = React.useRef(new Animated.Value(0)).current
  const [isPressing, setIsPressing] = React.useState(false)

  // Track the last haptic-pulse bucket so we only fire each pulse once per hold.
  const lastPulseBucket = React.useRef(-1)
  // Track whether the current hold has already completed (to avoid firing the
  // completion path twice if the animation and a late `onPressOut` race).
  const hasCompleted = React.useRef(false)

  // Existing developer screen behavior
  React.useEffect(() => {
    if (secretMenuCounter > 2) {
      navigate("developerScreen")
      setSecretMenuCounter(0)
    }
  }, [navigate, secretMenuCounter])

  // Drive haptic pulses and completion off the animation engine instead of a
  // setInterval. This removes the manual tick loop (and with it the unmount
  // leak) while keeping the progress-ring / haptic UX unchanged.
  React.useEffect(() => {
    const id = progressAnim.addListener(({ value }) => {
      const bucket = Math.floor(value * HAPTIC_PULSE_COUNT)
      if (bucket > lastPulseBucket.current && bucket < HAPTIC_PULSE_COUNT) {
        lastPulseBucket.current = bucket
        ReactNativeHapticFeedback.trigger("impactLight", {
          enableVibrateFallback: true,
          ignoreAndroidSystemSettings: false,
        })
      }

      if (value >= 1 && !hasCompleted.current) {
        hasCompleted.current = true
        setIsPressing(false)

        ReactNativeHapticFeedback.trigger("notificationSuccess", {
          enableVibrateFallback: true,
          ignoreAndroidSystemSettings: false,
        })

        logFeaturedProfileSelected({ discoveryMethod: "long_press" })
        navigate("FeaturedProfileView", { entryPoint: "long_press" })

        progressAnim.setValue(0)
        lastPulseBucket.current = -1
      }
    })

    return () => {
      progressAnim.removeListener(id)
      progressAnim.stopAnimation()
    }
  }, [progressAnim, navigate])

  const readableVersion = DeviceInfo.getReadableVersion()

  const handlePressIn = () => {
    // Reset per-hold state.
    lastPulseBucket.current = -1
    hasCompleted.current = false
    setIsPressing(true)

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: FEATURED_PROFILE.LONG_PRESS_DURATION_MS,
      useNativeDriver: false,
    }).start()
  }

  const handlePressOut = () => {
    setIsPressing(false)

    // If the hold already completed, the listener above has already reset
    // progressAnim to 0 and navigated away — nothing to do here.
    if (hasCompleted.current) return

    progressAnim.stopAnimation()
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: RESET_ANIM_MS,
      useNativeDriver: false,
    }).start(() => {
      lastPulseBucket.current = -1
    })
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
