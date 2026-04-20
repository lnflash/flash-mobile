/**
 * Featured Profile Configuration
 *
 * Configuration for the in-app WebView flow that opens when a featured
 * Nostr profile is matched in chat search or via the long-press entry
 * on the version component.
 */

export const FEATURED_PROFILE = {
  // Featured profile pubkey (hex)
  PUBKEY: 'fc8c4bbff8c314791e82fe928bc96e1ca88dfb1ffe9da3552b3587fe4d33e543',

  // NIP-05 identifier for the featured profile
  NIP05: 'satoshin@flashapp.me',

  // Search aliases that should match (with or without the domain)
  NIP05_ALIASES: ['satoshin', 'satoshi'],

  // Destination URL loaded in the WebView
  DESTINATION_URL: 'https://kotc.islandbitcoin.com/terminal/',

  // Long-press duration for the version-component entry (milliseconds)
  LONG_PRESS_DURATION_MS: 5000,

  // Transition animation duration (milliseconds)
  TRANSITION_DURATION_MS: 800,

  // User-facing copy — centralized so screen files stay neutral
  UI_TEXT: {
    HEADER_TITLE: 'Key Terminal',
    OVERLAY_TEXT: 'Entering the Terminal...',
    LOADING: 'Loading Terminal...',
    OFFLINE_TITLE: "You're offline",
    ERROR_TITLE: 'Connection Error',
    OFFLINE_MSG: 'Check your internet connection and try again.',
    ERROR_MSG: 'Unable to connect to the Key Terminal.',
    RETRY: 'Retry',
  },
} as const

export type FeaturedProfileEntryPoint = 'search' | 'long_press' | 'profile'
