import { useEffect, useSyncExternalStore } from "react"
import { Linking, LogBox } from "react-native"

// The assistant's switch for development and e2e builds (ENG-689, architect
// decision 3). assistantEnabled follows Remote Config, with no Local-instance
// override (docs/ai-assistant-tool-registry.md §1, rule 7), so nothing turns
// the assistant on in a test build that Maestro drives. This does, in a
// build where __DEV__ holds (Debug, which the e2e job builds), and never in
// a release build: the flows open
//
//   flash://dev/assistant?on=1    the assistant on, for this run of the app
//   flash://dev/assistant?off=1   back to what Remote Config says
//
// It turns on the assistant only, never voice, spoken replies or the server
// fallback, and it lives in memory: a relaunch forgets it. The navigation
// container ignores every flash://dev/ link (isDevLink), so the :payment
// route never sees this one. Like the card bridge's link (useDevCardLinks),
// turning it on means the e2e flows are driving this build, so it hides
// LogBox: its toasts sit over the bottom of the screen, where the thread's
// input and Ask button are, and take the flows' taps.

const isDev = (): boolean => typeof __DEV__ !== "undefined" && __DEV__ === true

let on = false
const listeners = new Set<() => void>()

/** Whether the override is on. Always false in a release build. */
export const assistantDevOverride = (): boolean => isDev() && on

/** Turn the override on or off. A no-op in a release build. */
export const setAssistantDevOverride = (value: boolean): void => {
  if (!isDev() || value === on) return
  on = value
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The override, re-rendering its reader when a link turns it on or off. */
export const useAssistantDevOverride = (): boolean =>
  useSyncExternalStore(subscribe, assistantDevOverride)

/**
 * What a dev link asks of the override: true for flash://dev/assistant?on=1,
 * false for ?off=1, and undefined for any other link, and for every link in
 * a release build.
 */
export const parseAssistantDevLink = (url: string): boolean | undefined => {
  if (!isDev() || !/^flash:\/\/dev\//i.test(url)) return undefined
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.pathname.replace(/\/+$/, "") !== "/assistant") return undefined
  if (parsed.searchParams.get("on") === "1") return true
  if (parsed.searchParams.get("off") === "1") return false
  return undefined
}

/**
 * Acts on the assistant's dev link, at launch and while the app runs. App
 * mounts it beside DevCardLinks, in a development build only; in a release
 * build the parser answers undefined anyway.
 */
export const useDevAssistantLink = (): void => {
  useEffect(() => {
    if (!isDev()) return undefined
    const handle = (url: string | null) => {
      const value = url ? parseAssistantDevLink(url) : undefined
      if (value === undefined) return
      setAssistantDevOverride(value)
      // Off leaves LogBox as it is: the card bridge may be hiding it too.
      if (value) LogBox.ignoreAllLogs(true)
    }
    Linking.getInitialURL().then(handle, () => undefined)
    const subscription = Linking.addEventListener("url", ({ url }) => handle(url))
    return () => subscription.remove()
  }, [])
}

/** useDevAssistantLink in a component of its own, rendering nothing. */
export const DevAssistantLink = (): null => {
  useDevAssistantLink()
  return null
}
