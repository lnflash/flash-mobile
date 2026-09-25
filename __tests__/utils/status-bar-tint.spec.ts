/**
 * ENG-609: the status-bar tint rule, pinned once instead of re-derived by hand.
 *
 * The screen-level specs assert what each screen renders; this one asserts the
 * rule they all now share, including the crossover behaviour no screen exercises
 * directly.
 */
import { dark, light } from "../../app/rne-theme/colors"
import {
  relativeLuminance,
  StatusBarTint,
  statusBarTintFor,
  TINT_LUMINANCE_CROSSOVER,
} from "../../app/utils/status-bar-tint"

describe("relativeLuminance", () => {
  it("anchors at black and white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 6)
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 6)
  })

  it("expands 3- and 4-digit shorthand and ignores alpha", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 6)
    expect(relativeLuminance("#000f")).toBeCloseTo(0, 6)
    expect(relativeLuminance("#FF7e1cff")).toBeCloseTo(
      relativeLuminance("#FF7e1c") as number,
      6,
    )
  })

  it("is case-insensitive", () => {
    expect(relativeLuminance("#ff7E1C")).toBeCloseTo(
      relativeLuminance("#FF7e1c") as number,
      6,
    )
  })

  it("weights green above red above blue, as WCAG does", () => {
    const red = relativeLuminance("#FF0000") as number
    const green = relativeLuminance("#00FF00") as number
    const blue = relativeLuminance("#0000FF") as number

    expect(green).toBeGreaterThan(red)
    expect(red).toBeGreaterThan(blue)
    expect(red + green + blue).toBeCloseTo(1, 6)
  })

  it("returns undefined for colours it cannot read", () => {
    expect(relativeLuminance("rgba(0, 0, 0, 0)")).toBeUndefined()
    expect(relativeLuminance("black")).toBeUndefined()
    expect(relativeLuminance("#12345")).toBeUndefined()
    expect(relativeLuminance("")).toBeUndefined()
    expect(relativeLuminance(undefined as unknown as string)).toBeUndefined()
  })
})

describe("statusBarTintFor", () => {
  it("sits at the WCAG white/black contrast crossover", () => {
    // Where contrast-with-white equals contrast-with-black: any lighter and
    // black icons read better, any darker and white ones do.
    expect(TINT_LUMINANCE_CROSSOVER).toBeCloseTo(0.1791, 4)
    expect(1.05 / (TINT_LUMINANCE_CROSSOVER + 0.05)).toBeCloseTo(
      (TINT_LUMINANCE_CROSSOVER + 0.05) / 0.05,
      6,
    )
  })

  it("flips on either side of the crossover", () => {
    // The flip lands between these two adjacent greys, which is as tight as an
    // 8-bit channel gets. #757575 is also React Native's own platform-default
    // status-bar grey, so this doubles as "the old default wanted light icons".
    expect(relativeLuminance("#757575") as number).toBeLessThan(TINT_LUMINANCE_CROSSOVER)
    expect(statusBarTintFor("#757575")).toBe("light-content")

    expect(relativeLuminance("#767676") as number).toBeGreaterThan(
      TINT_LUMINANCE_CROSSOVER,
    )
    expect(statusBarTintFor("#767676")).toBe("dark-content")
  })

  it("falls back to light-content — the pre-ENG-609 global — when unreadable", () => {
    expect(statusBarTintFor("rgba(0, 0, 0, 0)")).toBe("light-content")
    expect(statusBarTintFor(undefined as unknown as string)).toBe("light-content")
  })

  /**
   * Every background a screen hands the helper today, in both palettes. These
   * are the answers the ENG-609 sweep arrived at by hand; if a token's value
   * changes, this table is what notices.
   */
  const tintFor = (mode: "light" | "dark"): StatusBarTint =>
    mode === "dark" ? "dark-content" : "light-content"

  const cases: [string, string, StatusBarTint][] = (["light", "dark"] as const).flatMap(
    (mode) => {
      const colors: Record<string, string> = mode === "dark" ? dark : light

      return [
        // Camera screens paint their own black field.
        [mode, "#000", "light-content"],
        // account-upgrade-flow/Success — #007856 in both palettes.
        [mode, colors.primary, "light-content"],
        // The three success screens: #007856 light, #02c48d dark. This one row is
        // the whole reason the hand-written ternaries existed.
        [mode, colors.accent02, tintFor(mode)],
        // earns-map-screen (in progress) — #C3CCFF in both palettes.
        [mode, colors._sky, "dark-content"],
        // earns-map-screen (complete) and section-completed — #FF7e1c in both.
        [mode, colors._orange, "dark-content"],
        // earns-section — #fff200 in both.
        [mode, colors._gold, "dark-content"],
        // earns-quiz — #E6EBEf in both.
        [mode, colors._lighterGrey, "dark-content"],
      ] as [string, string, StatusBarTint][]
    },
  )

  cases.forEach(([mode, hex, expected]) => {
    it(`${mode} palette: ${hex} → ${expected}`, () => {
      expect(hex).toBeTruthy()
      expect(statusBarTintFor(hex)).toBe(expected)
    })
  })
})
