/**
 * Utility functions for string operations
 */

/**
 * Generates a random string of specified length
 * @param length Length of the random string to generate
 * @returns Random string
 */
export const generateRandomString = (length: number): string => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  const charactersLength = characters.length
  for (let i = 0; i < length; i += 1) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

/**
 * Truncates a string in the middle, replacing characters with ellipsis
 * @param str String to truncate
 * @param startChars Number of characters to keep at the start
 * @param endChars Number of characters to keep at the end
 * @returns Truncated string
 */
export const truncateMiddle = (str: string, startChars = 6, endChars = 4): string => {
  if (!str) return ""
  if (str.length <= startChars + endChars) return str

  return `${str.slice(0, startChars)}...${str.slice(-endChars)}`
}

/**
 * Formats a number as a fixed-digit string with leading zeros
 * @param num Number to format
 * @param digits Number of digits in the output
 * @returns String with fixed digits
 */
export const formatFixedDigits = (num: number, digits: number): string => {
  return num.toString().padStart(digits, "0")
}
