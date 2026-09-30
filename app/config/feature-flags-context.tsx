import React, { useState, createContext, useContext, useEffect } from "react"
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

  useEffect(() => {
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
        setRemoteConfig({
          deviceAccountEnabledRestAuth,
          bridgeTopupEnabled,
          cashuCardUsdEnabled,
        })
      } catch (err) {
        console.error("Error fetching remote config: ", err)
      } finally {
        setRemoteConfigReady(true)
      }
    })()
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
