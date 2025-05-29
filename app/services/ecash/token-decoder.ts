import { DecodedToken } from "@app/types/ecash"
import { Buffer } from "buffer"

/**
 * Utility functions for decoding Cashu tokens
 */
export class TokenDecoder {
  // List of known mints from https://bitcoinmints.com/?tab=mints&showCashu=true
  // and other trusted sources
  private static KNOWN_MINTS = [
    // Default Flash app mint
    "https://forge.flashapp.me",

    // Common Cashu mints
    "https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3XEkUNwiBiQGoC",
    "https://8333.space:3338",
    "https://cashu.space",
    "https://nutshell.nbd.wtf",

    // Additional mints from bitcoinmints.com
    "https://cashu.me",
    "https://mint.bienno.com",
    "https://mint.digibyte.ba",
    "https://mint.nutstash.app",
    "https://folgory.com",
    "https://mint.eldamar.icu",
    "https://banana.money",
    "https://lnbits.bitcoinrabbithole.org/cashu/api/v1/AjtMZ65eJ6xdZSJui2EKMw",
    "https://mint.satoshisdefi.com",
    "https://lnbits.lightni.ng/cashu/api/v1/UfD1QJu1ZD3xYhK9uRFkHt",
    "https://mint.ecash.btc-lab.ch",
  ]

  /**
   * Detects if a string is a valid Cashu token
   * @param data The string to check
   * @returns True if the string appears to be a Cashu token
   */
  static isCashuToken(data: string): boolean {
    // Check for Cashu protocol prefix
    if (
      typeof data === "string" &&
      (data.startsWith("cashu:") || data.toLowerCase().startsWith("cashu"))
    ) {
      return true
    }

    // Check if it's a base64 encoded token (could be from BC-UR)
    try {
      // Try to decode as base64 and check if it's a valid Cashu token structure
      const decoded = Buffer.from(data, "base64").toString("utf-8")
      const parsedData = JSON.parse(decoded)
      return (
        parsedData &&
        typeof parsedData === "object" &&
        parsedData.token &&
        Array.isArray(parsedData.token) &&
        parsedData.token.length > 0 &&
        parsedData.token[0].mint &&
        parsedData.token[0].proofs &&
        Array.isArray(parsedData.token[0].proofs)
      )
    } catch {
      // Not a base64 encoded JSON token
    }

    // Try parsing as JSON format
    try {
      const parsedData = JSON.parse(data)
      return (
        parsedData &&
        typeof parsedData === "object" &&
        parsedData.token &&
        Array.isArray(parsedData.token) &&
        parsedData.token.length > 0 &&
        parsedData.token[0].mint &&
        parsedData.token[0].proofs &&
        Array.isArray(parsedData.token[0].proofs)
      )
    } catch (error) {
      return false
    }
  }

  /**
   * Normalizes a Cashu token string by removing the protocol prefix
   * @param tokenString The raw token string
   * @returns The normalized token string
   */
  static normalizeTokenString(tokenString: string): string {
    if (tokenString.startsWith("cashu:")) {
      return tokenString.substring(6)
    } else if (tokenString.toLowerCase().startsWith("cashu")) {
      return tokenString.substring(5)
    }
    return tokenString
  }

  /**
   * Attempt to extract a mint URL from a token part by trying to decode it
   * @param part The token part to decode
   * @returns The extracted URL or empty string if none found
   */
  private static tryExtractMintUrl(part: string): string {
    try {
      const decoded = this.base64UrlDecode(part)
      console.log("Decoded part:", decoded)

      // Look for HTTP URLs
      if (decoded.includes("http")) {
        const urlMatch = decoded.match(/(https?:\/\/[^\s"']+)/i)
        if (urlMatch && urlMatch[1]) {
          console.log("Found mint URL in decoded part:", urlMatch[1])
          return urlMatch[1]
        }
      }

      // Look for domain patterns
      if (
        decoded.includes(".") &&
        (decoded.includes("://") ||
          decoded.includes(".com") ||
          decoded.includes(".me") ||
          decoded.includes(".org") ||
          decoded.includes(".app"))
      ) {
        // Try to extract a URL-like string
        const domainMatch = decoded.match(
          /([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s"']*)?)/i,
        )
        if (domainMatch && domainMatch[1]) {
          // If it doesn't have a protocol, add https://
          const url = domainMatch[1].startsWith("http")
            ? domainMatch[1]
            : `https://${domainMatch[1]}`
          console.log("Found domain-like mint URL:", url)
          return url
        }
      }
    } catch (e) {
      // Skip parts that can't be decoded
      console.log("Could not decode part:", part)
    }
    return ""
  }

  /**
   * Decodes a Cashu token string into its components
   * @param tokenString The raw token string
   * @returns A DecodedToken object with mint confidence or null if decoding fails
   */
  static decodeToken(
    tokenString: string,
  ): { token: DecodedToken; mintConfidence: "high" | "low" | "unknown" } | null {
    try {
      const normalizedToken = this.normalizeTokenString(tokenString)
      console.log("Normalized token:", normalizedToken)

      // Try JSON format first - these usually have explicit mint URLs
      try {
        const jsonToken = JSON.parse(normalizedToken)
        if (jsonToken && jsonToken.token && jsonToken.token.length > 0) {
          return {
            token: {
              mint: jsonToken.token[0].mint,
              encodedProofs: JSON.stringify(jsonToken.token[0].proofs),
              // Optional fields that might be present in some tokens
              memo: jsonToken.memo,
              unit: jsonToken.unit || "sat",
              v: jsonToken.v || 1,
            },
            mintConfidence: "high", // High confidence since it's explicitly in the JSON
          }
        }
      } catch (e) {
        // Not JSON, try URL format
        console.log("Not a JSON token, attempting to decode URL format")
      }

      // Handle URL-encoded token format (NUT-08)
      try {
        // Print the token for debugging
        console.log("URL-encoded token to decode:", normalizedToken)

        // Special case for tokens starting with "Bo" - these are binary format
        // These are in BOLT11-like binary encoding (not URL-encoded)
        if (normalizedToken.startsWith("Bo")) {
          console.log("Detected 'Bo' token format, using binary decoder")
          return this.decodeBinaryToken(normalizedToken)
        }

        // Special case for tokens starting with "B" but not "Bo" - may still be binary
        if (normalizedToken.startsWith("B") && !normalizedToken.includes("-")) {
          console.log("Detected 'B' token format without dashes, using binary decoder")
          return this.decodeBinaryToken(normalizedToken)
        }

        // URL format typically has components separated by dashes
        const parts = normalizedToken.split("-")
        console.log("Token parts:", parts)

        if (parts.length < 2) {
          throw new Error("Invalid token format: not enough components")
        }

        // Extract mint URL from the encoded data
        let mintUrl = ""
        let mintConfidence: "high" | "low" | "unknown" = "unknown"

        // Look for a part that could be a URL
        for (const part of parts) {
          if (part.includes(".") || part.includes("://")) {
            mintUrl = part
            console.log("Found mint URL in token parts:", mintUrl)
            mintConfidence = "high"
            break
          }
        }

        // If we couldn't find a mint URL directly, try decoding the token parts
        if (!mintUrl) {
          for (const part of parts) {
            mintUrl = this.tryExtractMintUrl(part)
            if (mintUrl) {
              mintConfidence = "high"
              break
            }
          }
        }

        // If we still don't have a mint URL, check if the raw token contains a URL
        if (!mintUrl && normalizedToken.includes("http")) {
          const urlMatch = normalizedToken.match(/(https?:\/\/[^\s"']+)/i)
          if (urlMatch && urlMatch[1]) {
            mintUrl = urlMatch[1]
            mintConfidence = "high"
            console.log("Found URL directly in token:", mintUrl)
          }
        }

        // If we still don't have a mint URL, use the first known mint but mark as unknown confidence
        if (!mintUrl) {
          console.log(
            "Could not extract mint URL from token, using default but with unknown confidence",
          )
          mintUrl = this.KNOWN_MINTS[0] // Default to first known mint
          mintConfidence = "unknown"
        }

        // In a real implementation, we would extract and decode the proofs properly
        // For now, we'll store the raw encoded data
        return {
          token: {
            mint: mintUrl,
            encodedProofs: normalizedToken,
            v: 1, // Assume version 1 for now
          },
          mintConfidence,
        }
      } catch (error) {
        console.error("Error decoding token:", error)
        return null
      }
    } catch (error) {
      console.error("Error in token decoding:", error)
      return null
    }
  }

  /**
   * Decode a binary format token (those starting with "B")
   * @param tokenData The binary encoded token data
   * @returns A decoded token object with mint confidence
   */
  private static decodeBinaryToken(tokenData: string): {
    token: DecodedToken
    mintConfidence: "high" | "low" | "unknown"
  } {
    console.log("Decoding binary token format:", tokenData)

    // These tokens often contain the mint URL embedded in them
    // Try to find "http" in the decoded data
    let mintUrl = ""
    let mintConfidence: "high" | "low" | "unknown" = "unknown"

    try {
      // Binary tokens starting with "Bo" usually contain a URL after the first few characters
      if (tokenData.startsWith("Bo")) {
        const extractedUrl = this.extractUrlFromBoToken(tokenData)
        if (extractedUrl) {
          mintUrl = extractedUrl
          mintConfidence = "high"
        }
      } else {
        // Standard decoding for non-"Bo" tokens
        const decoded = this.base64UrlDecode(tokenData)
        console.log("Decoded token (partial):", decoded.substring(0, 50))

        // Look for HTTP URLs in the decoded data
        if (decoded.includes("http")) {
          const urlMatch = decoded.match(/(https?:\/\/[^\s"']+)/i)
          if (urlMatch && urlMatch[1]) {
            mintUrl = urlMatch[1]
            mintConfidence = "high"
            console.log("Found mint URL in binary token:", mintUrl)
          }
        }
      }
    } catch (e) {
      console.log("Could not decode binary token:", e)
    }

    // If we still don't have a URL, check if any known mint is in the token
    if (!mintUrl) {
      // Check if token contains any of our known mints in encoded form
      for (const knownMint of this.KNOWN_MINTS) {
        if (
          tokenData.includes(knownMint.replace("https://", "")) ||
          tokenData.includes(knownMint.replace("https://", "").split(".")[0])
        ) {
          mintUrl = knownMint
          mintConfidence = "low" // Using "low" instead of "medium"
          console.log("Found matching known mint pattern:", mintUrl)
          break
        }
      }
    }

    // If we still don't have a URL, use the default mint
    if (!mintUrl) {
      mintUrl = this.KNOWN_MINTS[0]
      mintConfidence = "low"
      console.log("Using default mint for binary token:", mintUrl)
    }

    return {
      token: {
        mint: mintUrl,
        encodedProofs: tokenData,
        v: 1,
      },
      mintConfidence,
    }
  }

  /**
   * Extract URL from a token starting with "Bo"
   * @param tokenData The token data
   * @returns Extracted URL or empty string
   */
  private static extractUrlFromBoToken(tokenData: string): string {
    // For "Bo" tokens, try multiple extraction methods

    // 1. Try raw binary decoding
    try {
      const rawDecoded = Buffer.from(tokenData, "base64").toString("binary")
      console.log("Raw binary decoded (partial):", rawDecoded.substring(0, 50))

      // Check for URL in raw binary
      if (rawDecoded.includes("http")) {
        const urlMatch = rawDecoded.match(/(https?:\/\/[^\s"']+)/i)
        if (urlMatch && urlMatch[1]) {
          console.log("Found mint URL in raw binary:", urlMatch[1])
          return urlMatch[1]
        }
      }
    } catch (e) {
      console.log("Error decoding raw binary:", e)
    }

    // 2. Try base64url decoding
    try {
      const decoded = this.base64UrlDecode(tokenData)
      console.log("Base64URL decoded (partial):", decoded.substring(0, 50))

      if (decoded.includes("http")) {
        const urlMatch = decoded.match(/(https?:\/\/[^\s"']+)/i)
        if (urlMatch && urlMatch[1]) {
          console.log("Found mint URL in base64url decoded:", urlMatch[1])
          return urlMatch[1]
        }
      }
    } catch (e) {
      console.log("Error with base64url decode:", e)
    }

    // No URL found
    return ""
  }

  /**
   * Estimates the amount from a token (if possible)
   * @param token The decoded token
   * @returns The estimated amount or undefined if it cannot be determined
   */
  static estimateAmount(token: DecodedToken): number | undefined {
    try {
      // For JSON-format proofs that we've decoded
      if (token.encodedProofs.startsWith("[")) {
        const proofs = JSON.parse(token.encodedProofs)
        let totalAmount = 0
        for (const proof of proofs) {
          if (typeof proof.amount === "number") {
            totalAmount += proof.amount
          }
        }
        return totalAmount > 0 ? totalAmount : undefined
      }

      // For binary format tokens (starting with "B")
      if (token.encodedProofs.startsWith("B")) {
        return this.extractBinaryTokenAmount(token.encodedProofs)
      }

      // For URL-encoded tokens (NUT-08 format)
      return this.parseUrlEncodedAmount(token.encodedProofs)
    } catch (error) {
      console.error("Error estimating amount:", error)
      return undefined
    }
  }

  /**
   * Extract the amount from a binary token format
   * @param encodedToken The binary encoded token
   * @returns The extracted amount or undefined
   */
  private static extractBinaryTokenAmount(encodedToken: string): number | undefined {
    try {
      // For "Bo" tokens (special binary format), we need a different approach
      if (encodedToken.startsWith("Bo")) {
        try {
          // Try different decoding approaches

          // 1. Try raw binary
          const rawBinary = Buffer.from(encodedToken, "base64").toString("binary")

          // Look for "ah" followed by number (common in Cashu binary tokens)
          const amountMatch = rawBinary.match(/ah.?(\d+)/i)
          if (amountMatch && amountMatch[1]) {
            const amount = parseInt(amountMatch[1], 10)
            if (!isNaN(amount)) {
              console.log("Found amount in raw binary 'ah' pattern:", amount)
              return amount
            }
          }

          // Also try other common patterns in binary tokens
          const altMatch1 = rawBinary.match(/"amount".*?(\d+)/i)
          if (altMatch1 && altMatch1[1]) {
            const amount = parseInt(altMatch1[1], 10)
            if (!isNaN(amount)) {
              console.log("Found amount via 'amount' JSON pattern in 'Bo' token:", amount)
              return amount
            }
          }

          // Try to find numeric values that might be amounts
          const numMatch = rawBinary.match(/(\d+)/)
          if (numMatch && numMatch[1]) {
            const amount = parseInt(numMatch[1], 10)
            if (!isNaN(amount) && amount > 0 && amount < 10000) {
              // Only use reasonable amounts (1-10000 sats)
              console.log("Found potential amount in 'Bo' token:", amount)
              return amount
            }
          }

          // If we can't determine the amount, return undefined
          // instead of defaulting to 8 sats
          console.log("Could not extract amount from 'Bo' token")
          return undefined
        } catch (e) {
          console.log("Error extracting amount from 'Bo' token:", e)
          return undefined
        }
      }

      // Try standard extraction for other binary formats
      try {
        // Try to decode and look for amount field
        const decoded = this.base64UrlDecode(encodedToken)

        // Not a valid amount-containing token
        if (!decoded.includes("amount") && !decoded.includes("ah")) {
          // Try other patterns before giving up
          const numMatch = decoded.match(/(\d+)/)
          if (numMatch && numMatch[1]) {
            const amount = parseInt(numMatch[1], 10)
            if (!isNaN(amount) && amount > 0 && amount < 10000) {
              console.log("Found numeric amount in binary token:", amount)
              return amount
            }
          }
          return undefined
        }

        // Look for "ah" followed by number
        const amountMatch = decoded.match(/ah.?(\d+)/i)
        if (amountMatch && amountMatch[1]) {
          const amount = parseInt(amountMatch[1], 10)
          if (!isNaN(amount)) {
            console.log("Found amount in binary token:", amount)
            return amount
          }
        }

        // Try more generic approach - look for number after "amount"
        const jsonAmountMatch = decoded.match(/"amount".*?(\d+)/i)
        if (jsonAmountMatch && jsonAmountMatch[1]) {
          const amount = parseInt(jsonAmountMatch[1], 10)
          if (!isNaN(amount)) {
            console.log("Found amount via JSON pattern in binary token:", amount)
            return amount
          }
        }
      } catch (e) {
        console.log("Error in standard binary amount extraction:", e)
      }

      // Return undefined if we can't determine the amount
      return undefined
    } catch (e) {
      console.log("Error parsing binary token for amount:", e)
      return undefined
    }
  }

  /**
   * Parses a URL-encoded token to extract the amount
   * @param encodedProofs The encoded token string
   * @returns The parsed amount or undefined if it cannot be determined
   */
  private static parseUrlEncodedAmount(encodedProofs: string): number | undefined {
    try {
      const parts = encodedProofs.split("-")

      for (const part of parts) {
        const amount = this.extractAmountFromPart(part)
        if (amount !== undefined) {
          return amount
        }
      }

      console.log("Could not determine token amount, returning undefined")
      return undefined
    } catch (e) {
      console.log("Error parsing URL-encoded token for amount:", e)
      return undefined
    }
  }

  /**
   * Extracts amount from an encoded token part
   * @param part A single part from a token string
   * @returns The amount if found, otherwise undefined
   */
  private static extractAmountFromPart(part: string): number | undefined {
    try {
      // Attempt to decode the part
      const decoded = this.base64UrlDecode(part)

      // Look for JSON objects in the decoded part
      if (!decoded.includes("{") || !decoded.includes("}")) {
        return undefined
      }

      const jsonStart = decoded.indexOf("{")
      const jsonEnd = decoded.lastIndexOf("}") + 1

      if (jsonStart < 0 || jsonEnd <= jsonStart) {
        return undefined
      }

      const jsonStr = decoded.substring(jsonStart, jsonEnd)
      const obj = JSON.parse(jsonStr)

      // Check for amount in various possible locations based on the NUT specs
      if (obj.amount && typeof obj.amount === "number") {
        return obj.amount
      }

      if (obj.value && typeof obj.value === "number") {
        return obj.value
      }

      if (Array.isArray(obj.proofs)) {
        // If there's a proofs array, sum up the amounts
        let total = 0
        for (const proof of obj.proofs) {
          if (proof.amount && typeof proof.amount === "number") {
            total += proof.amount
          }
        }
        if (total > 0) return total
      }

      return undefined
    } catch (e) {
      // Silently return undefined if we can't parse this part
      return undefined
    }
  }

  /**
   * Decodes a Base64URL string to text
   * @param str The Base64URL encoded string
   * @returns The decoded string
   */
  private static base64UrlDecode(str: string): string {
    // Convert Base64URL to Base64 by replacing URL-safe chars and adding padding
    const base64 =
      str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4)

    // Decode Base64 to a Buffer, then to a string
    return Buffer.from(base64, "base64").toString()
  }

  /**
   * Get the list of known mints
   * @returns Array of known mint URLs
   */
  static getKnownMints(): string[] {
    return [...this.KNOWN_MINTS]
  }
}
