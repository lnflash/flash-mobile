import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { LevelContextProvider, AccountLevel } from "../../graphql/level-context"
import { PersistentStateProvider } from "../../store/persistent-state"
import { store } from "../../store/redux"
import Buttons from "./Buttons"

export default {
  title: "Home Screen/Buttons",
  component: Buttons,
  decorators: [
    (Story) => (
      <Provider store={store}>
        <PersistentStateProvider>
          <MockedProvider mocks={mocks} cache={createCache()}>
            <StoryScreen>{Story()}</StoryScreen>
          </MockedProvider>
        </PersistentStateProvider>
      </Provider>
    ),
  ],
} as Meta<typeof Buttons>

export const LevelOne = () => (
  <IsAuthedContextProvider value={true}>
    <LevelContextProvider value={AccountLevel.One}>
      <Buttons setModalVisible={() => {}} setDefaultAccountModalVisible={() => {}} />
    </LevelContextProvider>
  </IsAuthedContextProvider>
)

export const LevelTwo = () => (
  <IsAuthedContextProvider value={true}>
    <LevelContextProvider value={AccountLevel.Two}>
      <Buttons setModalVisible={() => {}} setDefaultAccountModalVisible={() => {}} />
    </LevelContextProvider>
  </IsAuthedContextProvider>
)

export const Unauthed = () => (
  <IsAuthedContextProvider value={false}>
    <LevelContextProvider value={AccountLevel.Zero}>
      <Buttons setModalVisible={() => {}} setDefaultAccountModalVisible={() => {}} />
    </LevelContextProvider>
  </IsAuthedContextProvider>
)
