import React, { useState, createContext, useContext, useEffect, useRef } from "react"
import { getRemoteConfig } from "@react-native-firebase/remote-config"
import { useAppConfig } from "@app/hooks"
import { useLevel } from "@app/graphql/level-context"

const DeviceAccountEnabledKey = "deviceAccountEnabledRestAuth"
const BridgeTopupEnabledKey = "bridgeTopupEnabled"
// Lets a Cashu card be topped up in USD as well as sats (ENG-616 D1). Off
// until flash-pos refuses or supports USD cards (ENG-619): today it prices
// every card proof as sats, so a USD card would be charged many times over.
const CashuCardUsdEnabledKey = "cashuCardUsdEnabled"

type FeatureFlags = {
  deviceAccountEnabled: boolean
  bridgeTopupEnabled: boolean
  cashuCardUsdEnabled: boolean
}

type RemoteConfig = {
  [DeviceAccountEnabledKey]: boolean
  [BridgeTopupEnabledKey]: boolean
  [CashuCardUsdEnabledKey]: boolean
}

const defaultRemoteConfig: RemoteConfig = {
  deviceAccountEnabledRestAuth: true,
  bridgeTopupEnabled: false,
  cashuCardUsdEnabled: false,
}

const defaultFeatureFlags = {
  deviceAccountEnabled: false,
  bridgeTopupEnabled: false,
  cashuCardUsdEnabled: false,
}

getRemoteConfig().setDefaults(defaultRemoteConfig)

getRemoteConfig().setConfigSettings({
  minimumFetchIntervalMillis: 0,
})

// How long a signed-out cold start waits on Remote Config before showing the
// app anyway. Past this, the app runs on the values already active: the
// defaults above, or what a previous launch fetched and activated. The fetch
// keeps going and updates the flags in-session when it lands. Without the
// bound, a slow or dead network held the splash for the fetch's whole 60 s
// HTTP timeout, or forever (ENG-634).
export const REMOTE_CONFIG_GATE_MS = 5000

export const FeatureFlagContext = createContext<FeatureFlags>(defaultFeatureFlags)

export const FeatureFlagContextProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig>(defaultRemoteConfig)

  const { currentLevel } = useLevel()
  const [remoteConfigReady, setRemoteConfigReady] = useState(false)

  const {
    appConfig: { galoyInstance },
  } = useAppConfig()

  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const gate = setTimeout(() => {
      if (mounted.current) setRemoteConfigReady(true)
    }, REMOTE_CONFIG_GATE_MS)

    ;(async () => {
      try {
        await getRemoteConfig().fetchAndActivate()
        const deviceAccountEnabledRestAuth = getRemoteConfig()
          .getValue(DeviceAccountEnabledKey)
          .asBoolean()
        const bridgeTopupEnabled = getRemoteConfig()
          .getValue(BridgeTopupEnabledKey)
          .asBoolean()
        const cashuCardUsdEnabled = getRemoteConfig()
          .getValue(CashuCardUsdEnabledKey)
          .asBoolean()
        if (!mounted.current) return
        setRemoteConfig({
          deviceAccountEnabledRestAuth,
          bridgeTopupEnabled,
          cashuCardUsdEnabled,
        })
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
