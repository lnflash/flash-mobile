/**
 * Image content type utilities for ID document upload (ENG-291)
 *
 * Android's react-native-image-picker and Vision Camera can return "image/jpg"
 * for JPEG files. The backend storage service only accepts "image/jpeg" —
 * normalize before calling the upload URL mutation.
 */

/** Content types accepted by the Flash backend storage service */
export const BACKEND_ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

export type AllowedContentType = (typeof BACKEND_ALLOWED_CONTENT_TYPES)[number]

/**
 * Normalize platform-specific content type aliases to backend-compatible types.
 * Specifically maps image/jpg → image/jpeg (Android returns image/jpg for some JPEGs).
 */
export const normalizeContentType = (contentType: string): string => {
  if (contentType === "image/jpg") return "image/jpeg"
  return contentType
}

/**
 * Returns true if the content type (after normalization) is accepted by the backend.
 * Note: always normalize before checking, or call normalizeContentType first.
 */
export const isValidContentType = (contentType: string): boolean => {
  return BACKEND_ALLOWED_CONTENT_TYPES.includes(contentType as AllowedContentType)
}
