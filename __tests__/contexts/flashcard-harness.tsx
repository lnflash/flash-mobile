import React from "react"
import { render } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"

import { FlashcardProvider } from "@app/contexts/Flashcard"
import { useFlashcard } from "@app/hooks/useFlashcard"
import { IsAuthedContextProvider } from "@app/graphql/is-authed-context"
import { PersistentStateContext } from "@app/store/persistent-state"
import theme from "@app/rne-theme/theme"

/**
 * Shared harness for the FlashcardProvider specs. Mounts the provider under
 * the contexts it reads (theme, auth, persistent state) and hands every
 * render's context value to `onSnapshot`, so a spec can drive `readFlashcard`
 * and read the resulting state back without rendering any UI of its own.
 *
 * Module mocks (js-lnurl, axios, the toast) stay in each spec: `jest.mock`
 * is hoisted per test file, and the spec is what holds the mock references.
 */

export type FlashcardSnapshot = ReturnType<typeof useFlashcard>

/** First render pays the provider's module-load cost (rneui, nfc, animatable). */
export const PROVIDER_RENDER_TIMEOUT_MS = 30000

type ProbeProps = {
  onSnapshot: (snapshot: FlashcardSnapshot) => void
}

const Probe = ({ onSnapshot }: ProbeProps) => {
  onSnapshot(useFlashcard())
  return null
}

export const renderProvider = (onSnapshot: (snapshot: FlashcardSnapshot) => void) =>
  render(
    <ThemeProvider theme={theme}>
      <IsAuthedContextProvider value={true}>
        <PersistentStateContext.Provider
          value={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            persistentState: {} as any,
            updateState: jest.fn(),
            resetState: jest.fn(),
          }}
        >
          <FlashcardProvider>
            <Probe onSnapshot={onSnapshot} />
          </FlashcardProvider>
        </PersistentStateContext.Provider>
      </IsAuthedContextProvider>
    </ThemeProvider>,
  )
