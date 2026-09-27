import { useCallback } from "react"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"

import type { FlashcardReadResult } from "@app/contexts/Flashcard"
import type { RootStackParamList } from "@app/navigation/stack-param-lists"

import { useFlashcard } from "./useFlashcard"

/**
 * Every control that asks for a card tap goes through here, so a tap opens the
 * screen for what was tapped wherever it started (ENG-616): a Cashu card opens
 * FlashcardV2, a BoltCard opens Card. `readFlashcard` itself stays free of
 * navigation. A tap from the screen it would open (a refresh) navigates to the
 * route already on top, which does nothing; the context update re-renders it.
 */
export const useTapFlashcard = (): (() => Promise<FlashcardReadResult>) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { readFlashcard } = useFlashcard()
  return useCallback(async () => {
    const result = await readFlashcard()
    if (result.cashuCard) navigation.navigate("FlashcardV2")
    else if (result.boltCard) navigation.navigate("Card")
    return result
  }, [navigation, readFlashcard])
}

/**
 * The Home Flashcard tile and the Settings Flashcard row: open the card the app
 * already holds, else ask for a tap. One rule for both entry points, BoltCard
 * first: a linked BoltCard opens Card (the Home tile exists only for it and
 * shows its balance), then a Cashu card read this session opens FlashcardV2,
 * then a tap routed by `useTapFlashcard`. A BoltCard holder reaches the Cashu
 * card by tapping it on any read control, including Card's own refresh.
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
