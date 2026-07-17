import { useState, useEffect } from "react"
import appCheck, { initializeAppCheck } from "@react-native-firebase/app-check"
import Config from "react-native-config"

const rnfbProvider = appCheck().newReactNativeFirebaseAppCheckProvider()
rnfbProvider.configure({
  android: {
    provider: __DEV__ ? "debug" : "playIntegrity",
    debugToken: Config.APP_CHECK_ANDROID_DEBUG_TOKEN,
  },
  apple: {
    provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback",
    debugToken: Config.APP_CHECK_IOS_DEBUG_TOKEN,
  },
})

// Initialize App Check once and reuse the instance. Re-initializing (and
// force-refreshing the token) on every GraphQL request adds a full attestation
// round-trip per call, which is slow and a frequent cause of spurious
// network failures on intermittent connections.
let appCheckInstance: ReturnType<typeof initializeAppCheck> | undefined

const getAppCheckInstance = () => {
  if (!appCheckInstance) {
    appCheckInstance = initializeAppCheck(undefined, {
      provider: rnfbProvider,
      isTokenAutoRefreshEnabled: true,
    })
    // Allow a retry on the next call if initialization itself failed —
    // but only clear our own promise, in case a newer attempt replaced it
    const thisAttempt = appCheckInstance
    thisAttempt.catch(() => {
      if (appCheckInstance === thisAttempt) {
        appCheckInstance = undefined
      }
    })
  }
  return appCheckInstance
}

export const getAppCheckToken = async (): Promise<string | undefined> => {
  try {
    const instance = await getAppCheckInstance()
    // false = use the cached token; the SDK auto-refreshes before expiry
    const result = await instance.getToken(false)
    return result.token
  } catch (err) {
    console.log("getAppCheckToken error", err)
    return undefined
  }
}

const useAppCheckToken = ({
  skip = false,
}: {
  skip: boolean
}): [string | undefined, boolean] => {
  const [token, setToken] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (skip) {
      return
    }

    ;(async () => {
      setLoading(true)
      const result = await getAppCheckToken()
      setToken(result)
      setLoading(false)
    })()
  }, [skip])

  return [token, loading]
}

export default useAppCheckToken
