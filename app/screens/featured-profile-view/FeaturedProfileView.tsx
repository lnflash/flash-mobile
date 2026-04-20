/**
 * Featured Profile View
 *
 * WebView-backed screen that loads the configured destination URL when a
 * featured Nostr profile is matched in chat search or reached via the
 * long-press entry on the version component. Includes a short fade-in
 * intro, offline/error handling, and persisted view tracking.
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native'
import { WebView } from 'react-native-webview'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import NetInfo from '@react-native-community/netinfo'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import Icon from 'react-native-vector-icons/Ionicons'

import { RootStackParamList } from '@app/navigation/stack-param-lists'
import { FEATURED_PROFILE } from '@app/constants/featured-profile'
import { logFeaturedViewOpened } from '@app/utils/analytics'
import { usePersistentStateContext } from '@app/store/persistent-state'

type FeaturedProfileViewRouteProp = RouteProp<RootStackParamList, 'FeaturedProfileView'>
type FeaturedProfileViewNavigationProp = StackNavigationProp<
  RootStackParamList,
  'FeaturedProfileView'
>

// View theme colors
const VIEW_COLORS = {
  background: '#0a0a0a',
  text: '#00ff00',
  textSecondary: '#33ff33',
  textDim: '#006600',
  headerBackground: 'rgba(10, 10, 10, 0.95)',
  overlayBackground: '#000000',
}

const FeaturedProfileView: React.FC = () => {
  const navigation = useNavigation<FeaturedProfileViewNavigationProp>()
  const route = useRoute<FeaturedProfileViewRouteProp>()
  const { entryPoint } = route.params

  const { persistentState, updateState } = usePersistentStateContext()

  // Animation states
  const overlayOpacity = useRef(new Animated.Value(1)).current
  const textOpacity = useRef(new Animated.Value(0)).current
  const [showOverlay, setShowOverlay] = useState(true)
  const [showWebView, setShowWebView] = useState(false)

  // WebView states
  const webViewRef = useRef<WebView>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOffline, setIsOffline] = useState(false)
  const [hasError, setHasError] = useState(false)

  // Check network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected)
    })
    return () => unsubscribe()
  }, [])

  // Track analytics and update persistent state
  useEffect(() => {
    const isFirstAccess = !persistentState?.featuredProfile?.hasViewedProfile

    logFeaturedViewOpened({
      entryPoint,
      isFirstAccess,
    })

    updateState((currentState) => {
      if (!currentState) return currentState
      return {
        ...currentState,
        featuredProfile: {
          hasViewedProfile: true,
          firstViewedAt:
            currentState.featuredProfile?.firstViewedAt || new Date().toISOString(),
          viewCount: (currentState.featuredProfile?.viewCount || 0) + 1,
        },
      }
    })
  }, [])

  // Run entry animation
  useEffect(() => {
    ReactNativeHapticFeedback.trigger('notificationSuccess', {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    })

    Animated.timing(textOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start()

    const timer = setTimeout(() => {
      setShowWebView(true)

      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: FEATURED_PROFILE.TRANSITION_DURATION_MS,
        useNativeDriver: true,
      }).start(() => {
        setShowOverlay(false)
      })
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  const handleGoBack = () => {
    navigation.goBack()
  }

  const handleRetry = () => {
    setHasError(false)
    setIsLoading(true)
    webViewRef.current?.reload()
  }

  const handleWebViewError = () => {
    setHasError(true)
    setIsLoading(false)
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={VIEW_COLORS.background} />

      {/* WebView - rendered behind overlay */}
      {showWebView && !isOffline && !hasError && (
        <WebView
          ref={webViewRef}
          source={{ uri: FEATURED_PROFILE.DESTINATION_URL }}
          style={styles.webView}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          onError={handleWebViewError}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={false}
          allowsBackForwardNavigationGestures={false}
        />
      )}

      {/* Loading indicator */}
      {isLoading && showWebView && !isOffline && !hasError && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={VIEW_COLORS.text} />
          <Text style={styles.loadingText}>{FEATURED_PROFILE.UI_TEXT.LOADING}</Text>
        </View>
      )}

      {/* Offline / Error View */}
      {(isOffline || hasError) && showWebView && (
        <View style={styles.offlineContainer}>
          <Icon name="cloud-offline-outline" size={64} color={VIEW_COLORS.textDim} />
          <Text style={styles.offlineTitle}>
            {isOffline
              ? FEATURED_PROFILE.UI_TEXT.OFFLINE_TITLE
              : FEATURED_PROFILE.UI_TEXT.ERROR_TITLE}
          </Text>
          <Text style={styles.offlineText}>
            {isOffline
              ? FEATURED_PROFILE.UI_TEXT.OFFLINE_MSG
              : FEATURED_PROFILE.UI_TEXT.ERROR_MSG}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Icon name="refresh" size={20} color={VIEW_COLORS.background} />
            <Text style={styles.retryButtonText}>{FEATURED_PROFILE.UI_TEXT.RETRY}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Custom Header */}
      <SafeAreaView style={styles.headerContainer}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <Icon name="arrow-back" size={24} color={VIEW_COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Icon name="key" size={18} color={VIEW_COLORS.text} style={styles.keyIcon} />
            <Text style={styles.headerTitle}>{FEATURED_PROFILE.UI_TEXT.HEADER_TITLE}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>

      {/* Transition Overlay */}
      {showOverlay && (
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Animated.View style={[styles.overlayContent, { opacity: textOpacity }]}>
            <Icon name="key" size={48} color={VIEW_COLORS.text} />
            <Text style={styles.overlayText}>{FEATURED_PROFILE.UI_TEXT.OVERLAY_TEXT}</Text>
            <View style={styles.cursorContainer}>
              <Text style={styles.cursor}>_</Text>
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: VIEW_COLORS.background,
  },
  webView: {
    flex: 1,
    backgroundColor: VIEW_COLORS.background,
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: VIEW_COLORS.headerBackground,
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 12,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  keyIcon: {
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: VIEW_COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  headerSpacer: {
    width: 40,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: VIEW_COLORS.overlayBackground,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  overlayContent: {
    alignItems: 'center',
  },
  overlayText: {
    fontSize: 18,
    color: VIEW_COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 24,
    letterSpacing: 2,
  },
  cursorContainer: {
    marginTop: 8,
  },
  cursor: {
    fontSize: 18,
    color: VIEW_COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: VIEW_COLORS.background,
    paddingTop: 100,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: VIEW_COLORS.textDim,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  offlineContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: VIEW_COLORS.background,
    paddingHorizontal: 40,
  },
  offlineTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: VIEW_COLORS.text,
    marginTop: 24,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  offlineText: {
    fontSize: 14,
    color: VIEW_COLORS.textDim,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: VIEW_COLORS.text,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 32,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: VIEW_COLORS.background,
    marginLeft: 8,
  },
})

export default FeaturedProfileView
