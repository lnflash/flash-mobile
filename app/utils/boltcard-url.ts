/**
 * Boltcard URL Parser
 *
 * Extracts baseUrl, storeId, and cardId from Boltcard LNURL payloads.
 *
 * Expected URL formats:
 * 1. Flash Plugin format: lnurlw://server/plugins/{storeId}/flash/.well-known/lnurlw/{cardId}?p=xxx
 * 2. Legacy boltcard format: lnurlw://server/boltcard?p=xxx (uses NFC tag ID as cardId)
 */

export interface BoltcardUrlInfo {
  baseUrl: string // e.g., "https://btcpay.example.com"
  storeId: string // e.g., "abc123"
  cardId: string // e.g., "card456"
  isLegacyFormat: boolean // true if legacy /boltcard format
}

export class BoltcardUrlParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BoltcardUrlParseError"
  }
}

/**
 * Parse a Boltcard LNURL payload to extract server info
 *
 * @param payload - The LNURL payload from NFC (e.g., "lnurlw://server/plugins/...")
 * @param nfcTagId - Optional NFC tag ID (used as cardId for legacy format)
 * @returns BoltcardUrlInfo with baseUrl, storeId, and cardId
 * @throws BoltcardUrlParseError if the URL format is not recognized
 */
export const parseBoltcardUrl = (payload: string, nfcTagId?: string): BoltcardUrlInfo => {
  if (!payload) {
    throw new BoltcardUrlParseError("Empty payload")
  }

  // Normalize the payload - convert lnurlw:// to https://
  let normalizedUrl = payload.trim()

  // Handle lnurlw:// scheme
  if (normalizedUrl.startsWith("lnurlw://")) {
    normalizedUrl = normalizedUrl.replace("lnurlw://", "https://")
  } else if (normalizedUrl.startsWith("lnurl://")) {
    normalizedUrl = normalizedUrl.replace("lnurl://", "https://")
  }

  // Try to parse as URL
  let url: URL
  try {
    url = new URL(normalizedUrl)
  } catch {
    throw new BoltcardUrlParseError(`Invalid URL format: ${payload}`)
  }

  const baseUrl = `${url.protocol}//${url.host}`

  // Try Flash Plugin format: /plugins/{storeId}/flash/.well-known/lnurlw/{cardId}
  const flashPluginMatch = url.pathname.match(
    /\/plugins\/([^/]+)\/flash\/\.well-known\/lnurlw\/([^/?]+)/,
  )

  if (flashPluginMatch) {
    return {
      baseUrl,
      storeId: flashPluginMatch[1],
      cardId: flashPluginMatch[2],
      isLegacyFormat: false,
    }
  }

  // Try alternate Flash Plugin format: /plugins/{storeId}/flash/boltcard/{cardId}
  const altFlashPluginMatch = url.pathname.match(/\/plugins\/([^/]+)\/flash\/boltcard\/([^/?]+)/)

  if (altFlashPluginMatch) {
    return {
      baseUrl,
      storeId: altFlashPluginMatch[1],
      cardId: altFlashPluginMatch[2],
      isLegacyFormat: false,
    }
  }

  // Try to extract storeId from any /plugins/{storeId}/ pattern
  const storeIdMatch = url.pathname.match(/\/plugins\/([^/]+)\//)

  if (storeIdMatch) {
    // We found a storeId, try to find cardId
    const cardIdMatch = url.pathname.match(/\/lnurlw\/([^/?]+)/) ||
      url.pathname.match(/\/boltcard\/([^/?]+)/) ||
      url.pathname.match(/\/card\/([^/?]+)/)

    const cardId = cardIdMatch?.[1] || nfcTagId

    if (!cardId) {
      throw new BoltcardUrlParseError("Could not extract cardId from URL and no NFC tag ID provided")
    }

    return {
      baseUrl,
      storeId: storeIdMatch[1],
      cardId,
      isLegacyFormat: false,
    }
  }

  // Legacy boltcard format: /boltcard?p=xxx or /boltcards/balance?p=xxx
  if (url.pathname.includes("/boltcard")) {
    if (!nfcTagId) {
      throw new BoltcardUrlParseError(
        "Legacy boltcard format detected but no NFC tag ID provided for cardId",
      )
    }

    // For legacy format, we can't determine storeId from URL
    // This would need to be handled differently (e.g., stored from initial registration)
    throw new BoltcardUrlParseError(
      "Legacy boltcard format does not include storeId - card settings not available",
    )
  }

  throw new BoltcardUrlParseError(`Unrecognized URL format: ${payload}`)
}

/**
 * Extract just the base URL from an LNURL payload
 */
export const extractBaseUrl = (payload: string): string => {
  if (!payload) {
    throw new BoltcardUrlParseError("Empty payload")
  }

  let normalizedUrl = payload.trim()

  if (normalizedUrl.startsWith("lnurlw://")) {
    normalizedUrl = normalizedUrl.replace("lnurlw://", "https://")
  } else if (normalizedUrl.startsWith("lnurl://")) {
    normalizedUrl = normalizedUrl.replace("lnurl://", "https://")
  }

  try {
    const url = new URL(normalizedUrl)
    return `${url.protocol}//${url.host}`
  } catch {
    throw new BoltcardUrlParseError(`Invalid URL format: ${payload}`)
  }
}

/**
 * Check if a payload looks like a Flash Plugin Boltcard URL
 */
export const isFlashPluginUrl = (payload: string): boolean => {
  if (!payload) return false

  const normalizedUrl = payload
    .trim()
    .replace("lnurlw://", "https://")
    .replace("lnurl://", "https://")

  return normalizedUrl.includes("/plugins/") && normalizedUrl.includes("/flash/")
}

/**
 * Generate a short display ID from a full cardId
 */
export const formatCardIdForDisplay = (cardId: string, maxLength: number = 8): string => {
  if (!cardId) return ""
  if (cardId.length <= maxLength) return cardId
  return `${cardId.substring(0, maxLength)}...`
}

export default {
  parseBoltcardUrl,
  extractBaseUrl,
  isFlashPluginUrl,
  formatCardIdForDisplay,
}
