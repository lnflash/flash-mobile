jest.mock("react-native-fingerprint-scanner", () => ({
  __esModule: true,
  default: {
    isSensorAvailable: jest.fn(),
    authenticate: jest.fn(),
    release: jest.fn(),
  },
}))
jest.mock("react-native-secure-key-store", () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
  ACCESSIBLE: {},
}))

import FingerprintScanner from "react-native-fingerprint-scanner"

import {
  AUTH_PROMPT_TIMEOUT_MS,
  createDeviceAuthGate,
} from "@app/assistant/engine/auth-gate"
import BiometricWrapper from "@app/utils/biometricAuthentication"

const fakeBiometric = (sensor: boolean, answer?: "success" | "failure" | "hang") => ({
  isSensorAvailable: jest.fn(async () => sensor),
  authenticate: jest.fn(
    async (_description: string, onSuccess: () => void, onFailure: () => void) => {
      if (answer === "success") onSuccess()
      if (answer === "failure") onFailure()
      if (answer === "hang") await new Promise<never>(() => {})
    },
  ),
})

const pinStore = (enabled: boolean) => ({ getIsPinEnabled: jest.fn(async () => enabled) })

describe("createDeviceAuthGate", () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  describe("availability", () => {
    it("is biometric where the device has a sensor", async () => {
      const gate = createDeviceAuthGate({
        description: "Confirm",
        biometric: fakeBiometric(true),
        pinStore: pinStore(false),
      })

      await expect(gate.availability()).resolves.toBe("biometric")
    })

    it("falls back to the in-app PIN when one is set and the screen can be shown", async () => {
      const gate = createDeviceAuthGate({
        description: "Confirm",
        promptPin: async () => true,
        biometric: fakeBiometric(false),
        pinStore: pinStore(true),
      })

      await expect(gate.availability()).resolves.toBe("pin")
    })

    it("is none with no sensor and no PIN: it fails closed", async () => {
      const gate = createDeviceAuthGate({
        description: "Confirm",
        promptPin: async () => true,
        biometric: fakeBiometric(false),
        pinStore: pinStore(false),
      })

      await expect(gate.availability()).resolves.toBe("none")
    })

    it("does not offer a PIN it has no screen to ask for", async () => {
      const gate = createDeviceAuthGate({
        description: "Confirm",
        biometric: fakeBiometric(false),
        pinStore: pinStore(true),
      })

      await expect(gate.availability()).resolves.toBe("none")
    })
  })

  describe("authenticate", () => {
    it("is true only when the biometric prompt succeeds", async () => {
      const yes = createDeviceAuthGate({
        description: "Confirm",
        biometric: fakeBiometric(true, "success"),
      })
      const no = createDeviceAuthGate({
        description: "Confirm",
        biometric: fakeBiometric(true, "failure"),
      })

      await expect(yes.authenticate()).resolves.toBe(true)
      await expect(no.authenticate()).resolves.toBe(false)
    })

    it("prompts with the caller's description", async () => {
      const biometric = fakeBiometric(true, "success")
      const gate = createDeviceAuthGate({ description: "Confirm the payment", biometric })

      await gate.authenticate()

      expect(biometric.authenticate.mock.calls[0][0]).toBe("Confirm the payment")
    })

    it("refuses without prompting when nothing is available", async () => {
      const biometric = fakeBiometric(false, "success")
      const promptPin = jest.fn(async () => true)
      const gate = createDeviceAuthGate({
        description: "Confirm",
        promptPin,
        biometric,
        pinStore: pinStore(false),
      })

      await expect(gate.authenticate()).resolves.toBe(false)
      expect(biometric.authenticate).not.toHaveBeenCalled()
      expect(promptPin).not.toHaveBeenCalled()
    })

    it("asks for the PIN when it is the only way, and reads its answer", async () => {
      const make = (promptPin: () => Promise<boolean>) =>
        createDeviceAuthGate({
          description: "Confirm",
          promptPin,
          biometric: fakeBiometric(false),
          pinStore: pinStore(true),
        })

      await expect(make(async () => true).authenticate()).resolves.toBe(true)
      await expect(make(async () => false).authenticate()).resolves.toBe(false)
      await expect(
        make(async () => {
          throw new Error("screen closed")
        }).authenticate(),
      ).resolves.toBe(false)
    })

    it("gives up on a prompt that never answers, as a failure", async () => {
      jest.useFakeTimers()
      const gate = createDeviceAuthGate({
        description: "Confirm",
        biometric: fakeBiometric(true, "hang"),
      })

      const answer = gate.authenticate()
      await Promise.resolve()
      await Promise.resolve()
      jest.advanceTimersByTime(AUTH_PROMPT_TIMEOUT_MS)

      await expect(answer).resolves.toBe(false)
    })

    it("fails closed when the sensor check itself throws", async () => {
      const biometric = fakeBiometric(true, "success")
      biometric.isSensorAvailable.mockRejectedValue(new Error("native module gone"))
      const gate = createDeviceAuthGate({ description: "Confirm", biometric })

      await expect(gate.authenticate()).resolves.toBe(false)
    })
  })

  describe("over the real BiometricWrapper", () => {
    const scanner = FingerprintScanner as unknown as {
      isSensorAvailable: jest.Mock
      authenticate: jest.Mock
    }

    it("answers false at once while another prompt is open, instead of hanging", async () => {
      // BiometricWrapper.authenticate returns early, calling neither callback,
      // while a prompt is already being handled (its isHandlingAuthenticate
      // guard). The app-lock screen's prompt is open here, and never answers.
      scanner.isSensorAvailable.mockResolvedValue("FaceID")
      scanner.authenticate.mockReturnValue(new Promise<never>(() => {}))
      BiometricWrapper.authenticate("Unlock", jest.fn(), jest.fn())
      jest.useFakeTimers()
      const gate = createDeviceAuthGate({ description: "Confirm" })

      // No timer needs to fire for the answer: it is not the timeout.
      await expect(gate.authenticate()).resolves.toBe(false)
      expect(scanner.authenticate).toHaveBeenCalledTimes(1)
    })
  })
})
