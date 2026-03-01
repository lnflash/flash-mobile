import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import { EditProfileUI } from "./edit-profile-ui"

const mockProfileEvent = {
  id: "abc123",
  pubkey: "fcd14f2f6ab7c1143979401a46f808a9bdc27682b1b77cb3f6e1210fc925f34a",
  created_at: Math.floor(Date.now() / 1000) - 86400,
  kind: 0,
  tags: [],
  content: JSON.stringify({
    username: "forge",
    name: "Forge",
    nip05: "forge@flashapp.me",
    lud16: "forge@flashapp.me",
    about: "10x developer at Flash",
    picture: "https://avatars.githubusercontent.com/u/1234567",
    website: "https://getflash.io",
  }),
  sig: "abc",
}

export default {
  title: "Nostr/EditProfileUI",
  component: EditProfileUI,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof EditProfileUI>

export const WithProfile = () => <EditProfileUI profileEvent={mockProfileEvent as any} />
export const NoProfile = () => <EditProfileUI profileEvent={null} />
