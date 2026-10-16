import {
  AuthOrigin,
  AuthRequirement,
  authPolicy,
} from "@app/assistant/engine/auth-policy"
import { makeAction } from "./executor-harness"

// ENG-684 decision 1 (owner, 2026-10-13): no mandatory biometric for
// text-initiated actions in v1; voice-initiated ones need it (Phase 4).
describe("authPolicy", () => {
  const table: [AuthOrigin, AuthRequirement][] = [
    ["text", "none"],
    ["voice", "biometric"],
  ]

  table.forEach(([origin, requirement]) =>
    it(`asks ${requirement} for a ${origin}-initiated action`, () => {
      expect(authPolicy(makeAction(), origin)).toBe(requirement)
    }),
  )

  it("asks biometrics for an origin it does not know, never nothing", () => {
    // Only a text-initiated action skips the gate. An origin that is missing
    // or misspelled (the executor refuses both) gets the stricter answer.
    const unknown = [undefined, "", "Voice", "assistant"] as unknown as AuthOrigin[]
    unknown.forEach((origin) => {
      expect(authPolicy(makeAction(), origin)).toBe("biometric")
    })
  })

  it("asks the same of every action intent", () => {
    const intents = [
      "prepareSend",
      "prepareReceive",
      "prepareGroupSend",
      "prepareConversion",
      "prepareCashout",
    ] as const
    intents.forEach((intent) => {
      expect(authPolicy(makeAction({ intent }), "text")).toBe("none")
      expect(authPolicy(makeAction({ intent }), "voice")).toBe("biometric")
    })
  })
})
