import { useCallback, useEffect, useRef } from "react"
import { Linking, LogBox } from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"

import type { FlashcardReadResult } from "@app/contexts/Flashcard"
import type { RootStackParamList } from "@app/navigation/stack-param-lists"
import { parseCardBridgeLink, setCardBridge } from "@app/utils/cashu-card-bridge"

import { useFlashcard } from "./useFlashcard"

export type TapFlashcardOptions = {
  /**
   * Open Card when the tap read a BoltCard (the default). Pass false from a
   * control that already shows the BoltCard and only refreshes it: the Home
   * tile's sync re-reads the card and updates the tile in place, as it did
   * before ENG-616, while the tile body is what opens Card. A Cashu card opens
   * FlashcardV2 either way, since no other screen shows it.
   */
  openBoltCard?: boolean
}

/**
 * Every control that asks for a card tap goes through here, so a tap opens the
 * screen for what was tapped wherever it started (ENG-616): a Cashu card opens
 * FlashcardV2, a BoltCard opens Card unless the caller opts out
 * (`openBoltCard`). `readFlashcard` itself stays free of navigation. A tap from
 * the screen it would open (a refresh) navigates to the route already on top,
 * which does nothing; the context update re-renders it.
 */
export const useTapFlashcard = ({
  openBoltCard = true,
}: TapFlashcardOptions = {}): (() => Promise<FlashcardReadResult>) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { readFlashcard } = useFlashcard()
  return useCallback(async () => {
    const result = await readFlashcard()
    if (result.cashuCard) navigation.navigate("FlashcardV2")
    else if (result.boltCard && openBoltCard) navigation.navigate("Card")
    return result
  }, [navigation, readFlashcard, openBoltCard])
}

/**
 * The Home Flashcard tile and the Settings Flashcard row: open the card the app
 * already holds, else ask for a tap. One rule for both entry points, BoltCard
 * first: a linked BoltCard opens Card (this Home tile shows its balance; the
 * attached Cashu card has a Home row of its own), then a Cashu card read this
 * session opens FlashcardV2, then a tap routed by `useTapFlashcard`. A BoltCard
 * holder reaches the Cashu card by tapping it on any read control, including
 * the Home tile's sync and Card's own refresh.
 */
export const useOpenFlashcard = (): (() => Promise<void>) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { lnurl, cashuCard } = useFlashcard()
  const tapFlashcard = useTapFlashcard()
  return useCallback(async () => {
    if (lnurl) {
      navigation.navigate("Card")
    } else if (cashuCard) {
      navigation.navigate("FlashcardV2")
    } else {
      await tapFlashcard()
    }
  }, [lnurl, cashuCard, navigation, tapFlashcard])
}

/**
 * Development builds only (ENG-634): acts on the dev card links the e2e flows
 * open, at launch and while running, signed in or not.
 * `flash://dev/card-bridge?...` sets or clears the simulated card
 * (`setCardBridge`); `flash://dev/card-tap` asks for a tap as the card
 * controls do, which with a bridge set reads cardsim and opens FlashcardV2.
 * The navigation container ignores these links (`isDevLink`). Mounted once,
 * inside FlashcardProvider and the navigation container (RootStack). Does
 * nothing in a release build: `parseCardBridgeLink` answers undefined there.
 */
export const useDevCardLinks = (): void => {
  const tapFlashcard = useTapFlashcard()
  // The listener is added once; it always calls the latest tap.
  const tap = useRef(tapFlashcard)
  tap.current = tapFlashcard
  useEffect(() => {
    if (!__DEV__) return undefined
    const handle = (url: string | null) => {
      const link = url ? parseCardBridgeLink(url) : undefined
      if (!link) return
      if (link.kind === "tap") {
        tap
          .current()
          .catch((err) =>
            console.warn("dev card tap failed:", err instanceof Error ? err.name : err),
          )
        return
      }
      try {
        setCardBridge(link.config)
        // A bridge means the e2e flows are driving this build: LogBox's
        // toasts sit over the bottom of every screen and take their taps.
        LogBox.ignoreAllLogs(link.config !== undefined)
      } catch (err) {
        console.warn("dev card bridge refused:", err instanceof Error ? err.message : err)
      }
    }
    Linking.getInitialURL().then(handle, () => undefined)
    const subscription = Linking.addEventListener("url", ({ url }) => handle(url))
    return () => subscription.remove()
  }, [])
}
