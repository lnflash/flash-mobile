import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import { PersistentStateProvider } from "../store/persistent-state"
import Post from "./post"

// Note: Post screen connects to Nostr relays, uses camera/image picker, and
// getSigner() for key retrieval. These will show empty/inactive in Storybook.
export default {
  title: "Social/Post",
  component: Post,
  decorators: [
    (Story) => (
      <PersistentStateProvider>
        <StoryScreen>{Story()}</StoryScreen>
      </PersistentStateProvider>
    ),
  ],
} as Meta<typeof Post>

export const Default = () => <Post />
