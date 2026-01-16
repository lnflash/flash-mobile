"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_webview_1 = require("react-native-webview");
const themed_1 = require("@rneui/themed");
const native_1 = require("@react-navigation/native");
const IrisBrowser = ({ initialUrl }) => {
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const { theme } = (0, themed_1.useTheme)();
    const webViewRef = (0, react_1.useRef)(null);
    const [canGoBack, setCanGoBack] = (0, react_1.useState)(false);
    const [canGoForward, setCanGoForward] = (0, react_1.useState)(false);
    const [currentUrl, setCurrentUrl] = (0, react_1.useState)(initialUrl || "https://iris.to");
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    const handleNavigationStateChange = (navState) => {
        setCanGoBack(navState.canGoBack);
        setCanGoForward(navState.canGoForward);
        setCurrentUrl(navState.url);
    };
    const goBack = () => {
        if (webViewRef.current && canGoBack) {
            webViewRef.current.goBack();
        }
    };
    const goForward = () => {
        if (webViewRef.current && canGoForward) {
            webViewRef.current.goForward();
        }
    };
    const reload = () => {
        if (webViewRef.current) {
            webViewRef.current.reload();
        }
    };
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
  `;
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
  `;
    return (<react_native_1.SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* WebView */}
      <react_native_webview_1.WebView ref={webViewRef} source={{ uri: currentUrl }} style={styles.webview} onNavigationStateChange={handleNavigationStateChange} onLoadStart={() => setIsLoading(true)} onLoadEnd={() => setIsLoading(false)} injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded} injectedJavaScript={customCSS} javaScriptEnabled={true} domStorageEnabled={true} startInLoadingState={true} renderLoading={() => (<react_native_1.View style={styles.loadingContainer}>
            <react_native_1.ActivityIndicator size="large" color={theme.colors.primary}/>
          </react_native_1.View>)}/>

      {/* Loading Indicator */}
      {isLoading && (<react_native_1.View style={styles.loadingOverlay}>
          <react_native_1.ActivityIndicator size="large" color={theme.colors.primary}/>
        </react_native_1.View>)}
    </react_native_1.SafeAreaView>);
};
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
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
}));
exports.default = IrisBrowser;
//# sourceMappingURL=iris-browser.js.map