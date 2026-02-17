import React, { useRef, useState } from "react"
import { View, ActivityIndicator, TouchableOpacity, SafeAreaView } from "react-native"
import { WebView } from "react-native-webview"
import { makeStyles, useTheme, Icon } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useNavigation } from "@react-navigation/native"

type IrisBrowserNavigationProp = StackNavigationProp<RootStackParamList, "irisBrowser">

type IrisBrowserProps = {
  initialUrl?: string
}

const IrisBrowser = ({ initialUrl }: IrisBrowserProps) => {
  const styles = useStyles()
  const navigation = useNavigation<IrisBrowserNavigationProp>()
  const { theme } = useTheme()
  const webViewRef = useRef<WebView>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [currentUrl, setCurrentUrl] = useState(initialUrl || "https://iris.to")
  const [isLoading, setIsLoading] = useState(true)

  const handleNavigationStateChange = (navState: any) => {
    setCanGoBack(navState.canGoBack)
    setCanGoForward(navState.canGoForward)
    setCurrentUrl(navState.url)
  }

  const goBack = () => {
    if (webViewRef.current && canGoBack) {
      webViewRef.current.goBack()
    }
  }

  const goForward = () => {
    if (webViewRef.current && canGoForward) {
      webViewRef.current.goForward()
    }
  }

  const reload = () => {
    if (webViewRef.current) {
      webViewRef.current.reload()
    }
  }

  // CSS to customize iris.to to match Flash branding
  const injectedJavaScriptBeforeContentLoaded = `
    (function() {
      const style = document.createElement('style');
      style.innerHTML = \`
        header, footer, nav, [role="banner"], [role="contentinfo"] {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
          overflow: hidden !important;
        }
        body { margin: 0 !important; padding: 0 !important; }
        main { margin-top: 0 !important; padding-top: 0 !important; }
      \`;
      document.documentElement.appendChild(style);
    })();
    true;
  `

  const customCSS = `
    (function() {
      // Add aggressive styles
      const style = document.createElement('style');
      style.id = 'flash-hide-chrome';
      style.innerHTML = \`
        header, footer, nav,
        [role="banner"], [role="contentinfo"],
        [class*="header"], [class*="Header"],
        [class*="footer"], [class*="Footer"],
        [class*="navbar"], [class*="Navbar"],
        [class*="nav"], [class*="Nav"] {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
          max-height: 0 !important;
          overflow: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        body, html {
          margin: 0 !important;
          padding: 0 !important;
        }

        main, [role="main"], #root, .app {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
      \`;

      if (!document.getElementById('flash-hide-chrome')) {
        document.head.appendChild(style);
      }

      // Function to hide elements
      function hideElements() {
        const selectors = [
          'header', 'footer', 'nav',
          '[role="banner"]', '[role="contentinfo"]',
          '[class*="header"]', '[class*="Header"]',
          '[class*="footer"]', '[class*="Footer"]',
          '[class*="navbar"]', '[class*="Navbar"]'
        ];

        selectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              el.style.cssText = 'display: none !important; visibility: hidden !important; height: 0 !important; overflow: hidden !important;';
            });
          } catch(e) {}
        });
      }

      // MutationObserver to continuously hide elements
      const observer = new MutationObserver(function(mutations) {
        hideElements();
      });

      // Start observing
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }

      // Run immediately and repeatedly
      hideElements();
      setInterval(hideElements, 500);

      // Also run on these events
      window.addEventListener('load', hideElements);
      document.addEventListener('DOMContentLoaded', hideElements);
    })();
    true;
  `

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* WebView */}
      <WebView
        ref={webViewRef}
        source={{ uri: currentUrl }}
        style={styles.webview}
        onNavigationStateChange={handleNavigationStateChange}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
        injectedJavaScript={customCSS}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        )}
      />

      {/* Loading Indicator */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
    </SafeAreaView>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey4,
  },
  headerButton: {
    padding: 5,
  },
  navigationButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  navButton: {
    padding: 8,
    marginHorizontal: 5,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.white,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },
}))

export default IrisBrowser