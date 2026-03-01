import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import ContactCard from "./contactCard"

const mockItem = {
  pubkey: "fcd14f2f6ab7c1143979401a46f808a9bdc27682b1b77cb3f6e1210fc925f34a",
  name: "Forge",
  type: "contact",
}

const mockProfileMap = new Map([
  [mockItem.pubkey, {
    pubkey: mockItem.pubkey,
    username: "forge",
    name: "Forge",
    picture: undefined,
  }],
])

export default {
  title: "Chat/ContactCard",
  component: ContactCard,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof ContactCard>

export const Default = () => (
  <ContactCard
    item={mockItem}
    profileMap={mockProfileMap as any}
    onPress={() => console.log("pressed")}
  />
)

export const Self = () => (
  <ContactCard
    item={mockItem}
    profileMap={mockProfileMap as any}
    isSelf
    onPress={() => console.log("pressed")}
  />
)

export const NoProfile = () => (
  <ContactCard
    item={{ pubkey: "unknown123", name: "", type: "contact" }}
    profileMap={new Map()}
    onPress={() => console.log("pressed")}
  />
)
