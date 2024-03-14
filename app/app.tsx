// Welcome to the main entry point of the app.
//
// In this file, we'll be kicking off our app

// language related import
import "intl-pluralrules"
import "./i18n/mapping"

// for URL; need a polyfill on react native
import "react-native-url-polyfill/auto"

import "react-native-reanimated"

import "@react-native-firebase/crashlytics"
import { ThemeProvider } from "@rneui/themed"
import "node-libs-react-native/globals" // needed for Buffer?
import * as React from "react"
import ErrorBoundary from "react-native-error-boundary"
import { RootSiblingParent } from "react-native-root-siblings"
import { GaloyToast } from "./components/galoy-toast"
import { NotificationComponent } from "./components/notification"
import { GaloyClient } from "./graphql/client"
import TypesafeI18n from "./i18n/i18n-react"
import { loadAllLocales } from "./i18n/i18n-util.sync"
import { AppStateWrapper } from "./navigation/app-state"
import { NavigationContainerWrapper } from "./navigation/navigation-container-wrapper"
import { RootStack } from "./navigation/root-navigator"
import theme from "./rne-theme/theme"
import { ErrorScreen } from "./screens/error-screen"
import { PersistentStateProvider } from "./store/persistent-state"
import { detectDefaultLocale } from "./utils/locale-detector"
import { ThemeSyncGraphql } from "./utils/theme-sync"
import { NetworkErrorComponent } from "./graphql/network-error-component"
import { FeatureFlagContextProvider } from "./config/feature-flags-context"
import "./utils/logs"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { Provider } from "react-redux"
import { store } from "./store/redux"
import PolyfillCrypto from "react-native-webview-crypto"
class MessageChannel {
  port1: MessagePort
  port2: MessagePort
  constructor() {
    this.port1 = new MessagePort()
    this.port2 = new MessagePort()
    this.port1.setOtherPort(this.port2)
    this.port2.setOtherPort(this.port1)
  }
}

class MessagePort {
  otherPort: MessagePort | null
  listeners: Map<any, any>
  constructor() {
    this.otherPort = null
    this.listeners = new Map()
  }

  setOtherPort(otherPort: MessagePort) {
    this.otherPort = otherPort
  }

  addEventListener(event: any, listener: any) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(listener)
  }

  removeEventListener(event: any, listener: any) {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      const index = eventListeners.indexOf(listener)
      if (index !== -1) {
        eventListeners.splice(index, 1)
      }
    }
  }

  postMessage(data: any) {
    this.otherPort!.dispatchEvent("message", { data })
  }

  start() {
    // No-op in React Native
  }

  dispatchEvent(event: string, data: { data: any }) {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.forEach((listener: (arg0: { data: any }) => any) => listener(data))
    }
  }
}

global.MessageChannel = MessageChannel

// FIXME should we only load the currently used local?
// this would help to make the app load faster
// this will become more important when we add more languages
// and when the earn section will be added
//
// alternatively, could try loadAllLocalesAsync()
loadAllLocales()

/**
 * This is the root component of our app.
 */
export const App = () => (
  /* eslint-disable-next-line react-native/no-inline-styles */
  <GestureHandlerRootView style={{ flex: 1 }}>
    <PolyfillCrypto />
    <PersistentStateProvider>
      <Provider store={store}>
        <TypesafeI18n locale={detectDefaultLocale()}>
          <ThemeProvider theme={theme}>
            <GaloyClient>
              <FeatureFlagContextProvider>
                <ErrorBoundary FallbackComponent={ErrorScreen}>
                  <NavigationContainerWrapper>
                    <RootSiblingParent>
                      <AppStateWrapper />
                      <NotificationComponent />
                      <RootStack />
                      <GaloyToast />
                      <NetworkErrorComponent />
                    </RootSiblingParent>
                  </NavigationContainerWrapper>
                </ErrorBoundary>
                <ThemeSyncGraphql />
              </FeatureFlagContextProvider>
            </GaloyClient>
          </ThemeProvider>
        </TypesafeI18n>
      </Provider>
    </PersistentStateProvider>
  </GestureHandlerRootView>
)
