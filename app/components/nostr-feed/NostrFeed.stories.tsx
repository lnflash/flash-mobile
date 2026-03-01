import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { NostrFeed } from "./NostrFeed"

// Note: NostrFeed connects to live Nostr relays — requires network access in Storybook
// Will show loading then populate from wss://relay.damus.io, etc.
const FORGE_PUBKEY = "fcd14f2f6ab7c1143979401a46f808a9bdc27682b1b77cb3f6e1210fc925f34a"

export default {
  title: "Nostr/NostrFeed",
  component: NostrFeed,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof NostrFeed>

export const ForgeProfile = () => <NostrFeed userPubkey={FORGE_PUBKEY} />
export const EmptyPubkey = () => <NostrFeed userPubkey="" />
