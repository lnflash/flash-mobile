import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { StoryScreen } from "../../../.storybook/views"
import { store } from "../../store/redux"
import Info from "./Info"

export default {
  title: "Home Screen/Info",
  component: Info,
  decorators: [(Story) => <Provider store={store}><StoryScreen>{Story()}</StoryScreen></Provider>],
} as Meta<typeof Info>

export const NoError = () => <Info refreshTriggered={false} />
export const Refreshing = () => <Info refreshTriggered={true} />
export const WithError = () => <Info refreshTriggered={false} error={{ networkError: true, graphqlError: false } as any} />
