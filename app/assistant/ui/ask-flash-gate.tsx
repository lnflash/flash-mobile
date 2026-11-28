import React, { useEffect } from "react"
import { CommonActions, useNavigation, useRoute } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useFeatureFlags } from "@app/config/feature-flags-context"
import { AskFlashScreen } from "./ask-flash-screen"

// The askFlash route (root-navigator.tsx). The thread is open only while
// assistantEnabled holds, and that flag is off in a store build whatever
// Remote Config says (assistantInThisBuild, assistant-dev-override.ts). With
// the flag off nothing of the thread renders, so no card it holds can be
// confirmed, and the route removes itself: when a link or button that skipped
// the flag reaches it, and at once when the flag turns off while it is open.
// It removes this route by its key, so a screen the thread opened on top of
// it stays where it is (React Navigation: goBack with source and target).
export const AskFlashGate: React.FC = () => {
  const { assistantEnabled } = useFeatureFlags()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const route = useRoute()

  useEffect(() => {
    if (assistantEnabled) return
    const state = navigation.getState()
    if (state.routes.findIndex((entry) => entry.key === route.key) > 0) {
      navigation.dispatch({
        ...CommonActions.goBack(),
        source: route.key,
        target: state.key,
      })
    } else {
      navigation.navigate("Primary", { screen: "Home" })
    }
  }, [assistantEnabled, navigation, route.key])

  return assistantEnabled ? <AskFlashScreen /> : null
}
