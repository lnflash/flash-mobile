// The IME-tracking padding used by input-at-bottom screens on Android
// (ENG-605). The worklet itself needs the reanimated UI runtime; the
// arithmetic it applies is `keyboardPaddingFor`, tested here.
import { keyboardPaddingFor } from "@app/hooks/use-keyboard-padding"

describe("keyboardPaddingFor", () => {
  it("contributes nothing while the keyboard is closed", () => {
    // Screen's SafeAreaView already pads the 48dp navigation bar.
    expect(keyboardPaddingFor(0, 48)).toBe(0)
  })

  it("subtracts the inset an ancestor already applies from the IME height", () => {
    // IME inset is measured from the window edge and includes the nav-bar
    // band; the ancestor pads 48 of it, so the composer needs the remainder.
    expect(keyboardPaddingFor(320, 48)).toBe(272)
  })

  it("passes the whole IME height through when nothing is pre-applied", () => {
    expect(keyboardPaddingFor(320, 0)).toBe(320)
  })

  it("never goes negative when the IME is shorter than the applied inset", () => {
    // Transitional frames while the keyboard animates out.
    expect(keyboardPaddingFor(20, 48)).toBe(0)
  })
})
