import { MockedProvider } from "@apollo/client/testing"
import React, { PropsWithChildren } from "react"
import { StoryScreen } from "../../.storybook/views"
import { createCache } from "../../app/graphql/cache"
import { IsAuthedContextProvider } from "../../app/graphql/is-authed-context"

import theme from "@app/rne-theme/theme"
import { NavigationContainer } from "@react-navigation/native"
import { ThemeProvider } from "@rneui/themed"

import mocks from "@app/graphql/mocks"
import { createStackNavigator } from "@react-navigation/stack"
import TypesafeI18n from "@app/i18n/i18n-react"
import { detectDefaultLocale } from "@app/utils/locale-detector"
import { Provider } from "react-redux"
import { store } from "@app/store/redux"
import { AppUpdateProvider } from "@app/components/app-update/app-update"

const Stack = createStackNavigator()

type Props = PropsWithChildren<{
  // Lets a spec swap in a different GraphQL payload — e.g. mobileVersions above
  // this device's build number, which the shared mocks deliberately are not.
  mocks?: typeof mocks
}>

export const ContextForScreen: React.FC<Props> = ({
  children,
  mocks: mocksOverride = mocks,
}) => (
  <ThemeProvider theme={theme}>
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home">
          {() => (
            <Provider store={store}>
              <MockedProvider mocks={mocksOverride} cache={createCache()}>
                <StoryScreen>
                  <TypesafeI18n locale={detectDefaultLocale()}>
                    <IsAuthedContextProvider value={true}>
                      {/* app.tsx mounts this above the navigator, so every
                          screen has the shared version check available. */}
                      <AppUpdateProvider>{children}</AppUpdateProvider>
                    </IsAuthedContextProvider>
                  </TypesafeI18n>
                </StoryScreen>
              </MockedProvider>
            </Provider>
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  </ThemeProvider>
)
