import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../.storybook/views"
import { createCache } from "../graphql/cache"
import mocks from "../graphql/mocks"
import { IsAuthedContextProvider } from "../graphql/is-authed-context"
import { store } from "../store/redux"
import { EarnSection } from "./earns-section"

const makeRoute = (section: string) => ({
  key: "earnsSection",
  name: "earnsSection" as const,
  params: { section: section as any },
}) as any

export default {
  title: "Earns/EarnSection",
  component: EarnSection,
  decorators: [
    (Story) => (
      <Provider store={store}>
        <IsAuthedContextProvider value={true}>
          <MockedProvider mocks={mocks} cache={createCache()}>
            <StoryScreen>{Story()}</StoryScreen>
          </MockedProvider>
        </IsAuthedContextProvider>
      </Provider>
    ),
  ],
} as Meta<typeof EarnSection>

export const BitcoinWhatIsIt = () => <EarnSection route={makeRoute("bitcoinWhatIsIt")} />
export const WhatIsMoney = () => <EarnSection route={makeRoute("WhatIsMoney")} />
