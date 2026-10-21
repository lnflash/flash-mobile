import { useEffect, useSyncExternalStore } from "react"
import { Linking, LogBox } from "react-native"
import { ASSISTANT_DEV_LINK } from "@env"

// The assistant's switch for development and e2e builds (ENG-689, architect
// decision 3), and for the test phones (ENG-734). assistantEnabled follows
// Remote Config, with no Local-instance override
// (docs/ai-assistant-tool-registry.md §1, rule 7), so nothing turns the
// assistant on in a test build that Maestro drives. This does, in a build
// where __DEV__ holds (Debug, which the e2e job builds) or that was bundled
// with ASSISTANT_DEV_LINK=true in its .env: the flows open
//
//   flash://dev/assistant?on=1    the assistant on, for this run of the app
//   flash://dev/assistant?off=1   back to what Remote Config says
//
// ASSISTANT_DEV_LINK is for local phone builds only. The test phones carry a
// production-mode bundle (--dev false), where __DEV__ is false, so without it
// the link would do nothing there. react-native-dotenv inlines it when the
// app is bundled, from .env, the other env files it reads, or the
// environment. A store build must never carry it, and
// scripts/ci/check-store-env.sh enforces that where it runs: the deploy
// workflows, the Fastfile's store lanes and `yarn aab-android` /
// `yarn apk-android` stop before building while the key is set. An archive
// made by hand in Xcode, or a bare `./gradlew bundleRelease`, runs no check;
// docs/release.md says to run it first.
//
// Plain links turn on the assistant only. Debug builds may explicitly opt in
// to native voice with ?on=1&voice=1 and speech output with &replies=1.
// Even a release build carrying ASSISTANT_DEV_LINK ignores these options.
// The replies option exposes Listen; automatic reading still needs a user
// preference. No link enables the server fallback. Overrides live in memory. The navigation
// container ignores every flash://dev/ link (isDevLink), so the :payment
// route never sees this one. Like the card bridge's link (useDevCardLinks),
// turning it on means the e2e flows are driving this build, so it hides
// LogBox: its toasts sit over the bottom of the screen, where the thread's
// input and Ask button are, and take the flows' taps.

/**
 * Whether this build honours the link: __DEV__, or ASSISTANT_DEV_LINK=true in
 * the .env it was bundled with. The store build paths that run
 * scripts/ci/check-store-env.sh (above) refuse to build with that key.
 */
const linkEnabled = (): boolean =>
  (typeof __DEV__ !== "undefined" && __DEV__ === true) || ASSISTANT_DEV_LINK === "true"

let on = false
let voiceOn = false
let repliesOn = false
const listeners = new Set<() => void>()

/** Whether the override is on. Always false in a build that ignores the link. */
export const assistantDevOverride = (): boolean => linkEnabled() && on

/** Debug voice is an explicit opt-in, never enabled by a release dev link. */
export const assistantVoiceDevOverride = (): boolean =>
  typeof __DEV__ !== "undefined" && __DEV__ === true && on && voiceOn

/** Publish both settings together so a first screen sees one coherent value. */
export const setAssistantDevOverride = (
  value: boolean,
  options: { voice?: boolean; replies?: boolean } = {},
): void => {
  if (!linkEnabled()) return
  const nextVoice =
    value &&
    typeof __DEV__ !== "undefined" &&
    __DEV__ === true &&
    (options.voice ?? voiceOn)
  const nextReplies =
    value &&
    typeof __DEV__ !== "undefined" &&
    __DEV__ === true &&
    (options.replies ?? repliesOn)
  if (value === on && nextVoice === voiceOn && nextReplies === repliesOn) return
  on = value
  voiceOn = nextVoice
  repliesOn = nextReplies
  listeners.forEach((listener) => listener())
}

export const useAssistantRepliesDevOverride = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => typeof __DEV__ !== "undefined" && __DEV__ === true && on && repliesOn,
  )

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The override, re-rendering its reader when a link turns it on or off. */
export const useAssistantDevOverride = (): boolean =>
  useSyncExternalStore(subscribe, assistantDevOverride)

export const useAssistantVoiceDevOverride = (): boolean =>
  useSyncExternalStore(subscribe, assistantVoiceDevOverride)

/**
 * What a dev link asks of the override: true for flash://dev/assistant?on=1,
 * false for ?off=1, and undefined for any other link, and for every link in
 * a build that ignores the dev link.
 */
export const parseAssistantDevLink = (url: string): boolean | undefined => {
  if (!linkEnabled() || !/^flash:\/\/dev\//i.test(url)) return undefined
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
 * Acts on the assistant's dev link, at launch and while the app runs.
 * DevLinks (app/components/dev-links.tsx) mounts it beside DevCardLinks, in
 * every build: it listens only in a build that honours the link, and
 * elsewhere the parser answers undefined anyway.
 */
export const useDevAssistantLink = (): void => {
  useEffect(() => {
    if (!linkEnabled()) return undefined
    const handle = (url: string | null) => {
      if (!url) return
      const value = parseAssistantDevLink(url)
      if (value === undefined) return
      const params = new URL(url).searchParams
      const voice = params.get("voice")
      const replies = params.get("replies")
      setAssistantDevOverride(value, {
        ...(voice === "1" ? { voice: true } : voice === "0" ? { voice: false } : {}),
        ...(replies === "1"
          ? { replies: true }
          : replies === "0"
          ? { replies: false }
          : {}),
      })
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
