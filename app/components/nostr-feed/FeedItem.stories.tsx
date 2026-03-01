import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { FeedItem } from "./FeedItem"

const mockEvent = {
  id: "abc123def456",
  pubkey: "fcd14f2f6ab7c1143979401a46f808a9bdc27682b1b77cb3f6e1210fc925f34a",
  created_at: Math.floor(Date.now() / 1000) - 3600,
  kind: 1,
  tags: [],
  content: "Just got paid in Bitcoin via Flash! ⚡️ #Bitcoin #Lightning #Flash",
  sig: "abc",
}

const mockEventWithImage = {
  ...mockEvent,
  id: "def789",
  content: "Check out this view from the office today! https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
}

const mockEventLong = {
  ...mockEvent,
  id: "ghi012",
  content: "The Lightning Network is transforming how we think about payments in the Caribbean. Flash makes it dead simple to send and receive sats instantly, with no banks involved. This is what financial sovereignty looks like. ⚡️ #LightningNetwork #Bitcoin #Caribbean #Flash #GetFlash",
}

export default {
  title: "Nostr/FeedItem",
  component: FeedItem,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof FeedItem>

export const TextPost = () => <FeedItem event={mockEvent} />
export const WithImage = () => <FeedItem event={mockEventWithImage} />
export const LongPost = () => <FeedItem event={mockEventLong} />
