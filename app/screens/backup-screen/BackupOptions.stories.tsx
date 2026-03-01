import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { StoryScreen } from "../../.storybook/views"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../graphql/cache"
import mocks from "../graphql/mocks"
import { PersistentStateProvider } from "../store/persistent-state"
import { store } from "../store/redux"
import { IsAuthedContextProvider } from "../graphql/is-authed-context"
import { LevelContextProvider, AccountLevel } from "../graphql/level-context"
import BackupOptions from "./BackupOptions"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {},
  setOptions: () => {},
  addListener: () => () => {},
  removeListener: () => {},
  isFocused: () => true,
  canGoBack: () => true,
  getParent: () => undefined,
  getState: () => ({ index: 0, routes: [] }),
  pop: () => {},
  replace: () => {},
  reset: () => {},
} as any

const mockRoute = {
  key: "BackupOptions",
  name: "BackupOptions" as const,
  params: undefined,
} as any

export default {
  title: "Backup Options Screen",
  component: BackupOptions,
  decorators: [
    (Story) => (
      <Provider store={store}>
        <PersistentStateProvider>
          <IsAuthedContextProvider value={true}>
            <LevelContextProvider value={AccountLevel.Two}>
              <MockedProvider mocks={mocks} cache={createCache()}>
                <StoryScreen>{Story()}</StoryScreen>
              </MockedProvider>
            </LevelContextProvider>
          </IsAuthedContextProvider>
        </PersistentStateProvider>
      </Provider>
    ),
  ],
} as Meta<typeof BackupOptions>

export const Default = () => (
  <BackupOptions navigation={mockNavigation} route={mockRoute} />
)
