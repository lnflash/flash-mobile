import React, { useState, createContext, useContext, useEffect } from "react"
import { getRemoteConfig } from "@react-native-firebase/remote-config"
import { useAppConfig } from "@app/hooks"
import { useLevel } from "@app/graphql/level-context"

const DeviceAccountEnabledKey = "deviceAccountEnabledRestAuth"
const BridgeTopupEnabledKey = "bridgeTopupEnabled"

type FeatureFlags = {
  deviceAccountEnabled: boolean
  bridgeTopupEnabled: boolean
}

type RemoteConfig = {
  [DeviceAccountEnabledKey]: boolean
  [BridgeTopupEnabledKey]: boolean
}

const defaultRemoteConfig: RemoteConfig = {
  deviceAccountEnabledRestAuth: true,
  // Default OFF: the Bridge/bank-topup GraphQL fields may not exist on the connected
  // backend yet. Keep this off until backend support is confirmed, then flip in
  // Firebase Remote Config. Gates the bridge queries in TopupCashout / AccountType.
  bridgeTopupEnabled: false,
}

const defaultFeatureFlags = {
  deviceAccountEnabled: false,
  bridgeTopupEnabled: false,
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
        setRemoteConfig({ deviceAccountEnabledRestAuth, bridgeTopupEnabled })
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
    bridgeTopupEnabled:
      remoteConfig.bridgeTopupEnabled || galoyInstance.id === "Local",
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
