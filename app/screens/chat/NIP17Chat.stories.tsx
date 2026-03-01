import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import { PersistentStateProvider } from "../store/persistent-state"
import { NIP17Chat } from "./NIP17Chat"

// Note: NIP17Chat connects to live Nostr relays — will show loading/empty in Storybook
// Navigation via useNavigation() hook
export default {
  title: "Chat/NIP17Chat",
  component: NIP17Chat,
  decorators: [
    (Story) => (
      <PersistentStateProvider>
        <StoryScreen>{Story()}</StoryScreen>
      </PersistentStateProvider>
    ),
  ],
} as Meta<typeof NIP17Chat>

export const Default = () => <NIP17Chat />
