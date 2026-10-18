import React from "react"

import { DevAssistantLink } from "@app/config/assistant-dev-override"
import { DevCardLinks } from "@app/hooks/use-tap-flashcard"

/**
 * The dev links' listeners. App mounts this once, in every build, inside
 * FlashcardProvider and the navigation container; each link is gated as
 * below.
 *
 * - DevCardLinks, the e2e flows' simulated card (ENG-634): development builds
 *   only. It is its own component, so its FlashcardContext read re-renders
 *   nothing else.
 * - DevAssistantLink, the e2e flows' and the test phones' switch for the
 *   assistant (ENG-689, ENG-734): every build. Its own check is its only gate:
 *   it listens where __DEV__ holds or the bundle carries
 *   ASSISTANT_DEV_LINK=true (assistant-dev-override.ts). The test phones'
 *   bundle is production-mode, so a __DEV__ guard here, or around this
 *   component in App, would leave the link dead on them.
 *
 * __tests__/config/assistant-dev-override.spec.tsx renders this with __DEV__
 * false and reads app.tsx for any condition around it.
 */
export const DevLinks = () => (
  <>
    {__DEV__ && <DevCardLinks />}
    <DevAssistantLink />
  </>
)
