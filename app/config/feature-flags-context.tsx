import React, { useState, createContext, useContext, useEffect, useRef } from "react"
import { getRemoteConfig } from "@react-native-firebase/remote-config"
import { useAppConfig } from "@app/hooks"
import { useLevel } from "@app/graphql/level-context"
import { useAssistantDevOverride } from "./assistant-dev-override"

const DeviceAccountEnabledKey = "deviceAccountEnabledRestAuth"
const BridgeTopupEnabledKey = "bridgeTopupEnabled"
// Lets a Cashu card be topped up in USD as well as sats (ENG-616 D1). Off
// until flash-pos refuses or supports USD cards (ENG-619): today it prices
// every card proof as sats, so a USD card would be charged many times over.
const CashuCardUsdEnabledKey = "cashuCardUsdEnabled"
// The Flash assistant (ENG-684, docs/ai-assistant-tool-registry.md §1, rule 7):
// the assistant itself, voice input, spoken replies, and the server-side
// model fallback. All four stay off until Remote Config turns them on, on
// the Local instance too: dogfooding flips the remote flag.
const AssistantEnabledKey = "assistantEnabled"
const AssistantVoiceKey = "assistantVoice"
const AssistantVoiceRepliesKey = "assistantVoiceReplies"
const AssistantServerFallbackKey = "assistantServerFallback"

type FeatureFlags = {
  deviceAccountEnabled: boolean
  bridgeTopupEnabled: boolean
  cashuCardUsdEnabled: boolean
  assistantEnabled: boolean
  assistantVoice: boolean
  assistantVoiceReplies: boolean
  assistantServerFallback: boolean
}

type RemoteConfig = {
  [DeviceAccountEnabledKey]: boolean
  [BridgeTopupEnabledKey]: boolean
  [CashuCardUsdEnabledKey]: boolean
  [AssistantEnabledKey]: boolean
  [AssistantVoiceKey]: boolean
  [AssistantVoiceRepliesKey]: boolean
  [AssistantServerFallbackKey]: boolean
}

const defaultRemoteConfig: RemoteConfig = {
  deviceAccountEnabledRestAuth: true,
  bridgeTopupEnabled: false,
  cashuCardUsdEnabled: false,
  assistantEnabled: false,
  assistantVoice: false,
  assistantVoiceReplies: false,
  assistantServerFallback: false,
}

const defaultFeatureFlags = {
  deviceAccountEnabled: false,
  bridgeTopupEnabled: false,
  cashuCardUsdEnabled: false,
  assistantEnabled: false,
  assistantVoice: false,
  assistantVoiceReplies: false,
  assistantServerFallback: false,
}

// Resolves once the native side has handed JS its values: the defaults above
// and whatever a previous launch fetched and activated. Until then the JS
// cache is empty and every getValue reads "static".
const nativeValuesLoaded = getRemoteConfig().setDefaults(defaultRemoteConfig)

getRemoteConfig().setConfigSettings({
  minimumFetchIntervalMillis: 0,
})

// How long a signed-out cold start waits on Remote Config before showing the
// app anyway. Past this, the app runs on the values already active
// (`readActive`): what a previous launch fetched and activated, else the
// defaults above. The fetch keeps going and updates the flags in-session when
// it lands. Without the bound, a slow or dead network held the splash for the
// fetch's whole 60 s HTTP timeout, or forever (ENG-634).
export const REMOTE_CONFIG_GATE_MS = 5000

/**
 * The values active right now, without fetching: what a previous launch
 * fetched and activated, else the defaults above. A key the JS cache does not
 * hold yet (source "static", before `nativeValuesLoaded`) reads as its
 * default here, not as the static `false`.
 */
const readActive = (): RemoteConfig => {
  const read = (key: keyof RemoteConfig): boolean => {
    const value = getRemoteConfig().getValue(key)
    return value.getSource() === "static" ? defaultRemoteConfig[key] : value.asBoolean()
  }
  return {
    [DeviceAccountEnabledKey]: read(DeviceAccountEnabledKey),
    [BridgeTopupEnabledKey]: read(BridgeTopupEnabledKey),
    [CashuCardUsdEnabledKey]: read(CashuCardUsdEnabledKey),
    [AssistantEnabledKey]: read(AssistantEnabledKey),
    [AssistantVoiceKey]: read(AssistantVoiceKey),
    [AssistantVoiceRepliesKey]: read(AssistantVoiceRepliesKey),
    [AssistantServerFallbackKey]: read(AssistantServerFallbackKey),
  }
}

export const FeatureFlagContext = createContext<FeatureFlags>(defaultFeatureFlags)

export const FeatureFlagContextProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig>(readActive)

  const { currentLevel } = useLevel()
  const [remoteConfigReady, setRemoteConfigReady] = useState(false)

  const {
    appConfig: { galoyInstance },
  } = useAppConfig()

  const mounted = useRef(true)
  // A debug or e2e build's switch for the assistant (ENG-689); always off
  // in a release build.
  const assistantDevOverride = useAssistantDevOverride()

  useEffect(() => {
    mounted.current = true
    const gate = setTimeout(() => {
      if (mounted.current) setRemoteConfigReady(true)
    }, REMOTE_CONFIG_GATE_MS)

    // The previously activated values, as soon as the native side hands them
    // over (a local read, well inside the gate), so a gate that opens before
    // the fetch lands runs on them and not on the hard-coded defaults. Read
    // whenever it lands: the JS cache always holds the latest active values.
    nativeValuesLoaded.then(
      () => {
        if (mounted.current) setRemoteConfig(readActive())
      },
      () => undefined,
    )
    ;(async () => {
      try {
        await getRemoteConfig().fetchAndActivate()
        if (!mounted.current) return
        setRemoteConfig(readActive())
      } catch (err) {
        console.error("Error fetching remote config: ", err)
      } finally {
        clearTimeout(gate)
        if (mounted.current) setRemoteConfigReady(true)
      }
    })()

    return () => {
      mounted.current = false
      clearTimeout(gate)
    }
  }, [])

  const featureFlags = {
    deviceAccountEnabled:
      remoteConfig.deviceAccountEnabledRestAuth || galoyInstance.id === "Local",
    bridgeTopupEnabled: remoteConfig.bridgeTopupEnabled || galoyInstance.id === "Local",
    cashuCardUsdEnabled: remoteConfig.cashuCardUsdEnabled || galoyInstance.id === "Local",
    // No Local override for the assistant flags (spec §1, rule 7). A debug
    // or e2e build may turn the assistant itself on with a dev link
    // (assistant-dev-override.ts, ENG-689 decision 3); a release build never.
    assistantEnabled: remoteConfig.assistantEnabled || assistantDevOverride,
    assistantVoice: remoteConfig.assistantVoice,
    assistantVoiceReplies: remoteConfig.assistantVoiceReplies,
    assistantServerFallback: remoteConfig.assistantServerFallback,
  }

  if (!remoteConfigReady && currentLevel === "NonAuth") {
    return null
  }

  return (
    <FeatureFlagContext.Provider value={featureFlags}>
      {children}
    </FeatureFlagContext.Provider>
  )
}

export const useFeatureFlags = () => useContext(FeatureFlagContext)
