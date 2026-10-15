import BiometricWrapper from "@app/utils/biometricAuthentication"
import KeyStoreWrapper from "@app/utils/storage/secureStorage"

// The gate a Confirm passes when the auth policy asks for biometrics
// (docs/ai-assistant-tool-registry.md §5): the device's biometrics, with the
// OS passcode as their fallback, then the in-app PIN as a last resort. It
// fails closed. With none of them it says so before anything is prompted,
// and the card disables Confirm with a pointer to the PIN and biometric
// settings. A device with only an OS passcode fails closed too: JavaScript
// cannot detect a passcode without showing a prompt.

export type AuthAvailability = "biometric" | "pin" | "none"

export type AuthGate = {
  /** What the gate would prompt with, without prompting. */
  availability: () => Promise<AuthAvailability>
  /** Prompt. True only when the user proved it is them; any doubt is false. */
  authenticate: () => Promise<boolean>
}

type BiometricApi = Pick<typeof BiometricWrapper, "isSensorAvailable" | "authenticate">
type PinStore = Pick<typeof KeyStoreWrapper, "getIsPinEnabled">

/**
 * A backstop for a native prompt that never answers. Generous, since the
 * user may take their time; the prompt it gives up on stays harmless, as its
 * late answer is ignored.
 */
export const AUTH_PROMPT_TIMEOUT_MS = 120_000

export type DeviceAuthGateOptions = {
  /** The text the OS biometric prompt shows. */
  description: string
  /**
   * Shows the in-app PIN screen and resolves true for a correct PIN. That
   * screen is UI (authentication-screen/pin-screen.tsx), so the caller
   * supplies it; without it the PIN is not offered.
   */
  promptPin?: () => Promise<boolean>
  biometric?: BiometricApi
  pinStore?: PinStore
  timeoutMs?: number
}

export const createDeviceAuthGate = ({
  description,
  promptPin,
  biometric = BiometricWrapper,
  pinStore = KeyStoreWrapper,
  timeoutMs = AUTH_PROMPT_TIMEOUT_MS,
}: DeviceAuthGateOptions): AuthGate => {
  const availability = async (): Promise<AuthAvailability> => {
    if (await biometric.isSensorAvailable()) return "biometric"
    if (promptPin && (await pinStore.getIsPinEnabled())) return "pin"
    return "none"
  }

  const biometricPrompt = async (): Promise<boolean> => {
    let answer: boolean | undefined
    // BiometricWrapper.authenticate returns early, calling neither callback,
    // while another prompt is open (its isHandlingAuthenticate guard). A
    // promise waiting on the callbacks would never settle. It calls one of
    // them before its own promise resolves, so once that promise has settled
    // a missing answer is the early return, and reads as false.
    const prompted = biometric
      .authenticate(
        description,
        () => {
          answer = true
        },
        () => {
          answer = false
        },
      )
      .then(
        () => answer === true,
        () => false,
      )
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs)
    })
    try {
      return await Promise.race([prompted, timedOut])
    } finally {
      clearTimeout(timer)
    }
  }

  const authenticate = async (): Promise<boolean> => {
    try {
      const available = await availability()
      if (available === "biometric") return await biometricPrompt()
      if (available === "pin" && promptPin) return (await promptPin()) === true
      return false
    } catch {
      return false
    }
  }

  return { availability, authenticate }
}
