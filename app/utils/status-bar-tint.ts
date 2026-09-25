/**
 * Which status-bar icon tint is legible over a given background (ENG-609).
 *
 * `ThemedStatusBar` picks the tint from the theme mode, which is right for every
 * screen that sits on the theme background. A screen that paints its own
 * full-bleed field under the status bar has to override it, and under Android
 * 15+ forced edge-to-edge there is no opaque band left to hide a wrong choice —
 * the clock and signal icons land straight on that field.
 *
 * Before this helper the right tint was derived by hand at each call site: three
 * copies of a `mode === "dark" ? … : …` ternary for `accent02`, plus hard-coded
 * constants elsewhere. Nothing made a wrong answer detectable, which is exactly
 * how `section-completed` and `earns-quiz` were missed in the first sweep, and a
 * future edit to `accent02`'s dark value would have silently invalidated all
 * three ternaries. Deriving the tint from the colour itself makes every call
 * site correct by construction: change the token, the tint follows.
 *
 * The rule is WCAG's own. Contrast against white is `1.05 / (L + 0.05)` and
 * against black is `(L + 0.05) / 0.05`, where `L` is relative luminance; the two
 * are equal at `L = sqrt(1.05 * 0.05) - 0.05 = 0.1791`. Above that crossover
 * black icons (`dark-content`) win, below it white ones (`light-content`) do.
 */

/** The WCAG white/black contrast crossover: sqrt(1.05 * 0.05) - 0.05. */
export const TINT_LUMINANCE_CROSSOVER = Math.sqrt(1.05 * 0.05) - 0.05

/** `#abc`, `#aabbcc` and `#aabbccdd` (alpha ignored — the band is opaque). */
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

const expandShorthand = (digits: string) =>
  digits.length <= 4
    ? digits
        .split("")
        .map((d) => d + d)
        .join("")
    : digits

/** sRGB 0-255 channel → linear-light 0-1, per WCAG 2.x. */
const linearize = (channel: number) => {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * WCAG relative luminance of a hex colour, 0 (black) to 1 (white).
 *
 * Returns `undefined` for anything it cannot read — an `rgba()` string, a named
 * colour, a themed token that turned out to be undefined — so callers can fall
 * back rather than silently treat it as black.
 */
export const relativeLuminance = (color: string): number | undefined => {
  if (typeof color !== "string" || !HEX_COLOR.test(color.trim())) return undefined

  const digits = expandShorthand(color.trim().slice(1))
  const r = parseInt(digits.slice(0, 2), 16)
  const g = parseInt(digits.slice(2, 4), 16)
  const b = parseInt(digits.slice(4, 6), 16)

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

export type StatusBarTint = "dark-content" | "light-content"

/**
 * The legible status-bar icon tint over `backgroundColor`.
 *
 * Unreadable input falls back to `light-content`, which is what the app-wide
 * default was before ENG-609 — a no-worse-than-before answer rather than a
 * crash on a screen that is otherwise fine.
 */
export const statusBarTintFor = (backgroundColor: string): StatusBarTint => {
  const luminance = relativeLuminance(backgroundColor)

  if (luminance === undefined) return "light-content"

  return luminance > TINT_LUMINANCE_CROSSOVER ? "dark-content" : "light-content"
}
