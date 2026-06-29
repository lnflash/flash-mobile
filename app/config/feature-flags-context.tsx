import React, { useState, createContext, useContext, useEffect } from "react"
import { getRemoteConfig } from "@react-native-firebase/remote-config"
import { useAppConfig } from "@app/hooks"
import { useLevel } from "@app/graphql/level-context"

const DeviceAccountEnabledKey = "deviceAccountEnabledRestAuth"
const UsdtWalletEnabledKey = "usdtWalletEnabled"

type FeatureFlags = {
  deviceAccountEnabled: boolean
  usdtWalletEnabled: boolean
}

type RemoteConfig = {
  [DeviceAccountEnabledKey]: boolean
  [UsdtWalletEnabledKey]: boolean
}

const defaultRemoteConfig: RemoteConfig = {
  deviceAccountEnabledRestAuth: true,
  // Default OFF: the USDT cutover GraphQL field may not exist on the connected
  // backend yet. Keep this off until backend support is confirmed, then flip in
  // Firebase Remote Config. Gates the cashWalletCutover query.
  usdtWalletEnabled: false,
}

const defaultFeatureFlags = {
  deviceAccountEnabled: false,
  usdtWalletEnabled: false,
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
        const usdtWalletEnabled = getRemoteConfig()
          .getValue(UsdtWalletEnabledKey)
          .asBoolean()
        setRemoteConfig({ deviceAccountEnabledRestAuth, usdtWalletEnabled })
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
    usdtWalletEnabled:
      remoteConfig.usdtWalletEnabled || galoyInstance.id === "Local",
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
