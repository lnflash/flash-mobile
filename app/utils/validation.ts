/**
 * Validates that a string is a valid HTTP or HTTPS URL
 * @param url The string to validate
 * @returns True if the string is a valid HTTP or HTTPS URL
 */
export const isValidHttpUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
  } catch (error) {
    return false
  }
}
