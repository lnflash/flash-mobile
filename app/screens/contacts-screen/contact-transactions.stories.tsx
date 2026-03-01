import React from "react"
import { Meta } from "@storybook/react"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../.storybook/views"
import { createCache } from "../graphql/cache"
import mocks from "../graphql/mocks"
import { IsAuthedContextProvider } from "../graphql/is-authed-context"
import { ContactTransactions } from "./contact-transactions"

export default {
  title: "Contacts/ContactTransactions",
  component: ContactTransactions,
  decorators: [
    (Story) => (
      <IsAuthedContextProvider value={true}>
        <MockedProvider mocks={mocks} cache={createCache()}>
          <StoryScreen>{Story()}</StoryScreen>
        </MockedProvider>
      </IsAuthedContextProvider>
    ),
  ],
} as Meta<typeof ContactTransactions>

export const Default = () => <ContactTransactions contactUsername="testuser" />
export const EmptyUsername = () => <ContactTransactions contactUsername="" />
