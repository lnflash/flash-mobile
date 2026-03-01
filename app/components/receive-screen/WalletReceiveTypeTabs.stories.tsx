import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { PersistentStateProvider } from "../../store/persistent-state"
import WalletReceiveTypeTabs from "./WalletReceiveTypeTabs"

export default {
  title: "Receive Screen/WalletReceiveTypeTabs",
  component: WalletReceiveTypeTabs,
  decorators: [
    (Story) => (
      <PersistentStateProvider>
        <StoryScreen>{Story()}</StoryScreen>
      </PersistentStateProvider>
    ),
  ],
} as Meta<typeof WalletReceiveTypeTabs>

export const Default = () => <WalletReceiveTypeTabs request={null} />
export const WithRequest = () => <WalletReceiveTypeTabs request={{ type: "lightning" }} />
