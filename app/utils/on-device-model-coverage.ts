import AsyncStorage from "@react-native-async-storage/async-storage"
import { Platform } from "react-native"
import DeviceInfo from "react-native-device-info"

import { AssistantCoverageParams, logAssistantCoverage } from "./analytics"

// How many installs could run an on-device model (docs/ai-assistant-tool-
// registry.md §7.1; ENG-689, architect decision 4). Phase 3 (an on-device
// model per platform) is funded on real numbers, so every install reports
// once, whatever the assistant's flag, what it could run: the OS's major
// version and the model's generation, nothing that identifies anyone. It
// lives outside app/assistant because the app reports it at launch, and
// nothing outside the assistant imports from it (module-boundary.spec.ts).
//
// A heuristic, and it says so:
// - iOS: Apple's Foundation Models need iOS 26 and an Apple Intelligence
//   iPhone: the iPhone 15 Pro and Pro Max (iPhone16,1 and iPhone16,2) and
//   every iPhone since the 16 (iPhone17,x on). Whether the user turned Apple
//   Intelligence on, or lives where it is offered, JavaScript cannot see.
//   iPads are counted as not available, an undercount.
// - Android: false. Gemini Nano's AICore cannot be asked about without
//   native code.

/** The AsyncStorage key that says this install has reported. */
export const COVERAGE_REPORTED_KEY = "assistant.onDeviceModelCoverage.v1"

/** The first iOS with Apple's Foundation Models framework. */
export const FOUNDATION_MODELS_MIN_IOS = 26

export type DeviceProfile = {
  platform: string
  /** The OS's version as the device reports it: "26.0.1", "14". */
  osVersion: string
  /** The model identifier: "iPhone17,1" on iOS; a board name elsewhere. */
  deviceId: string
}

/** Whether an iPhone's model identifier is one with Apple Intelligence. */
export const isAppleIntelligenceIphone = (deviceId: string): boolean => {
  const model = /^iPhone(\d+),(\d+)$/.exec(deviceId)
  if (!model) return false
  const [generation, variant] = [Number(model[1]), Number(model[2])]
  return generation >= 17 || (generation === 16 && (variant === 1 || variant === 2))
}

/** What a device could run, in the event's own terms. */
export const coverageOf = ({
  platform,
  osVersion,
  deviceId,
}: DeviceProfile): AssistantCoverageParams => {
  const major = Number.parseInt(osVersion, 10)
  const osMajorVersion = Number.isFinite(major) ? major : null
  if (platform === "ios") {
    return {
      onDeviceModelAvailable:
        osMajorVersion !== null &&
        osMajorVersion >= FOUNDATION_MODELS_MIN_IOS &&
        isAppleIntelligenceIphone(deviceId),
      platform: "ios",
      osMajorVersion,
      // The generation only ("iPhone17"); a simulator reports its CPU.
      deviceClass: /^(?:iPhone|iPad|iPod)\d+/.exec(deviceId)?.[0] ?? "other",
    }
  }
  return {
    onDeviceModelAvailable: false,
    platform: platform === "android" ? "android" : "other",
    osMajorVersion,
    deviceClass: platform === "android" ? "android" : "other",
  }
}

type CoverageStorage = Pick<typeof AsyncStorage, "getItem" | "setItem">

/**
 * Report this install's coverage, once: true when this call reported it.
 * The key is written before the event is logged, so an install reports at
 * most once even if the app dies in between. It never throws.
 */
export const reportOnDeviceModelCoverage = async ({
  storage = AsyncStorage,
  device,
  log = logAssistantCoverage,
}: {
  storage?: CoverageStorage
  device?: () => DeviceProfile
  log?: (params: AssistantCoverageParams) => void
} = {}): Promise<boolean> => {
  try {
    if (await storage.getItem(COVERAGE_REPORTED_KEY)) return false
    const profile = device
      ? device()
      : {
          platform: Platform.OS,
          osVersion: DeviceInfo.getSystemVersion(),
          deviceId: DeviceInfo.getDeviceId(),
        }
    await storage.setItem(COVERAGE_REPORTED_KEY, "1")
    log(coverageOf(profile))
    return true
  } catch (err) {
    console.warn("[assistant] could not report on-device model coverage", err)
    return false
  }
}
