import React, {
  useState,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { getRemoteConfig } from "@react-native-firebase/remote-config"
import { useAppConfig } from "@app/hooks"
import { CASHU_MINT_URL } from "@app/config/appinfo"
import { normalizeCardMint } from "@app/utils/cashu-card-topup/mint-url"
import { setCardFundMints } from "@app/utils/cashu-card-topup/connected"
import { useLevel } from "@app/graphql/level-context"
import {
  useAssistantDevOverride,
  useAssistantRepliesDevOverride,
  useAssistantVoiceDevOverride,
} from "./assistant-dev-override"

const DeviceAccountEnabledKey = "deviceAccountEnabledRestAuth"
const BridgeTopupEnabledKey = "bridgeTopupEnabled"
// Lets a Cashu card be topped up in USD as well as sats (ENG-616 D1). Off
// until flash-pos refuses or supports USD cards (ENG-619): today it prices
// every card proof as sats, so a USD card would be charged many times over.
const CashuCardUsdEnabledKey = "cashuCardUsdEnabled"
// The mints the Cash wallet may pay for a card top-up (ENG-787 decision 1): a
// JSON array of https mint URLs. Forge alone until the owner adds a mint,
// after one real top-up and one tidy there. Unfetched, malformed or empty
// reads as forge alone: never open.
const CardFundMintsKey = "cardFundMints"
// The Flash assistant (ENG-684, docs/ai-assistant-tool-registry.md §1, rule 7):
// the assistant itself, voice input, spoken replies, the server-side model
// fallback, and the on-device model (ENG-690). All five stay off until
// Remote Config turns them on, on the Local instance too: dogfooding flips
// the remote flag.
const AssistantEnabledKey = "assistantEnabled"
const AssistantVoiceKey = "assistantVoice"
const AssistantVoiceRepliesKey = "assistantVoiceReplies"
const AssistantServerFallbackKey = "assistantServerFallback"
// The on-device model tier's own switch (ENG-690, architect decision 2): it
// rides on two beta SDKs (Foundation Models, ML Kit GenAI), and dogfooding
// compares the grammar alone with the grammar and the model. The tier runs
// only while assistantEnabled is on too (ask-flash-screen.tsx).
const AssistantOnDeviceModelKey = "assistantOnDeviceModel"

type FeatureFlags = {
  deviceAccountEnabled: boolean
  bridgeTopupEnabled: boolean
  cashuCardUsdEnabled: boolean
  /** Normalized mint URLs, never empty: forge alone by default. */
  cardFundMints: readonly string[]
  assistantEnabled: boolean
  assistantVoice: boolean
  assistantVoiceReplies: boolean
  assistantServerFallback: boolean
  assistantOnDeviceModel: boolean
}

type BooleanKey =
  | typeof DeviceAccountEnabledKey
  | typeof BridgeTopupEnabledKey
  | typeof CashuCardUsdEnabledKey
  | typeof AssistantEnabledKey
  | typeof AssistantVoiceKey
  | typeof AssistantVoiceRepliesKey
  | typeof AssistantServerFallbackKey
  | typeof AssistantOnDeviceModelKey

type RemoteConfig = {
  [DeviceAccountEnabledKey]: boolean
  [BridgeTopupEnabledKey]: boolean
  [CashuCardUsdEnabledKey]: boolean
  [CardFundMintsKey]: string
  [AssistantEnabledKey]: boolean
  [AssistantVoiceKey]: boolean
  [AssistantVoiceRepliesKey]: boolean
  [AssistantServerFallbackKey]: boolean
  [AssistantOnDeviceModelKey]: boolean
}

const defaultRemoteConfig: RemoteConfig = {
  deviceAccountEnabledRestAuth: true,
  bridgeTopupEnabled: false,
  cashuCardUsdEnabled: false,
  cardFundMints: JSON.stringify([CASHU_MINT_URL]),
  assistantEnabled: false,
  assistantVoice: false,
  assistantVoiceReplies: false,
  assistantServerFallback: false,
  assistantOnDeviceModel: false,
}

const FORGE_ONLY: readonly string[] = [CASHU_MINT_URL]

/**
 * The fund list as Remote Config gives it: a JSON array of mint URLs, each
 * kept only when `normalizeCardMint` takes it (https, no credentials, query
 * or fragment, short enough for a card). Anything else, an empty array, or a
 * list in which no entry survives, is forge alone: the fence never opens on
 * a bad value.
 */
export const parseCardFundMints = (raw: unknown): readonly string[] => {
  if (typeof raw !== "string") return FORGE_ONLY
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return FORGE_ONLY
  }
  if (!Array.isArray(parsed)) return FORGE_ONLY
  const mints: string[] = []
  parsed.forEach((entry) => {
    if (typeof entry !== "string") return
    const checked = normalizeCardMint(entry)
    if (checked.ok && !mints.includes(checked.url)) mints.push(checked.url)
  })
  return mints.length > 0 ? mints : FORGE_ONLY
}

const defaultFeatureFlags: FeatureFlags = {
  deviceAccountEnabled: false,
  bridgeTopupEnabled: false,
  cashuCardUsdEnabled: false,
  cardFundMints: FORGE_ONLY,
  assistantEnabled: false,
  assistantVoice: false,
  assistantVoiceReplies: false,
  assistantServerFallback: false,
  assistantOnDeviceModel: false,
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
  const read = (key: BooleanKey): boolean => {
    const value = getRemoteConfig().getValue(key)
    return value.getSource() === "static" ? defaultRemoteConfig[key] : value.asBoolean()
  }
  const readString = (key: typeof CardFundMintsKey): string => {
    try {
      const value = getRemoteConfig().getValue(key)
      return value.getSource() === "static" ? defaultRemoteConfig[key] : value.asString()
    } catch {
      return defaultRemoteConfig[key]
    }
  }
  return {
    [DeviceAccountEnabledKey]: read(DeviceAccountEnabledKey),
    [BridgeTopupEnabledKey]: read(BridgeTopupEnabledKey),
    [CashuCardUsdEnabledKey]: read(CashuCardUsdEnabledKey),
    [CardFundMintsKey]: readString(CardFundMintsKey),
    [AssistantEnabledKey]: read(AssistantEnabledKey),
    [AssistantVoiceKey]: read(AssistantVoiceKey),
    [AssistantVoiceRepliesKey]: read(AssistantVoiceRepliesKey),
    [AssistantServerFallbackKey]: read(AssistantServerFallbackKey),
    [AssistantOnDeviceModelKey]: read(AssistantOnDeviceModelKey),
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
  // A debug or e2e build's switch for the assistant (ENG-689), and a local
  // phone build's with ASSISTANT_DEV_LINK (ENG-734); never meant for a store
  // build (assistant-dev-override.ts says where that is enforced).
  const assistantDevOverride = useAssistantDevOverride()
  const assistantVoiceDevOverride = useAssistantVoiceDevOverride()
  const assistantRepliesDevOverride = useAssistantRepliesDevOverride()

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

  const cardFundMints = useMemo(
    () => parseCardFundMints(remoteConfig.cardFundMints),
    [remoteConfig.cardFundMints],
  )
  // The card flows outside React (the minter, the relay) read the same list.
  setCardFundMints(cardFundMints)

  const featureFlags: FeatureFlags = {
    deviceAccountEnabled:
      remoteConfig.deviceAccountEnabledRestAuth || galoyInstance.id === "Local",
    bridgeTopupEnabled: remoteConfig.bridgeTopupEnabled || galoyInstance.id === "Local",
    cashuCardUsdEnabled: remoteConfig.cashuCardUsdEnabled || galoyInstance.id === "Local",
    // No Local override: a fund mint is a money decision, never a test default.
    cardFundMints,
    // No Local override for the assistant flags (spec §1, rule 7). A debug
    // or e2e build, or a local phone build with ASSISTANT_DEV_LINK, may turn
    // the assistant itself on with a dev link (assistant-dev-override.ts,
    // ENG-689 decision 3, ENG-734), never meant for a store build.
    // Debug links can explicitly opt into voice atomically with the assistant;
    // a Remote Config fetch cannot overwrite that test-session choice.
    assistantEnabled: remoteConfig.assistantEnabled || assistantDevOverride,
    assistantVoice: remoteConfig.assistantVoice || assistantVoiceDevOverride,
    assistantVoiceReplies:
      remoteConfig.assistantVoiceReplies || assistantRepliesDevOverride,
    assistantServerFallback: remoteConfig.assistantServerFallback,
    assistantOnDeviceModel: remoteConfig.assistantOnDeviceModel,
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
