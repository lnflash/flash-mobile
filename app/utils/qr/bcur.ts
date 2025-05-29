import { UR, UREncoder, URDecoder } from "@gandlaf21/bc-ur"
import { Buffer } from "buffer"

export interface BCURConfig {
  fragmentLength?: number
  fragmentInterval?: number
}

export class BCURQRCode {
  private static DEFAULT_FRAGMENT_LENGTH = 200
  private static DEFAULT_FRAGMENT_INTERVAL = 100 // milliseconds

  /**
   * Encodes a token string into BC-UR fragments for QR display
   * @param tokenString The base64 encoded token string
   * @param config Configuration for fragment length and interval
   * @returns An object with methods to control the QR code generation
   */
  static encodeToken(tokenString: string, config?: BCURConfig) {
    const fragmentLength = config?.fragmentLength || this.DEFAULT_FRAGMENT_LENGTH
    const fragmentInterval = config?.fragmentInterval || this.DEFAULT_FRAGMENT_INTERVAL

    // Convert the token string to a buffer
    const messageBuffer = Buffer.from(tokenString, "base64")
    const ur = UR.fromBuffer(messageBuffer)
    const encoder = new UREncoder(ur, fragmentLength)

    let interval: NodeJS.Timeout | null = null
    let currentFragment = encoder.nextPart()
    let fragmentIndex = 0

    const controller = {
      // Get the current fragment
      getCurrentFragment: () => currentFragment,

      // Start the QR code loop
      start: (onUpdate: (fragment: string) => void) => {
        // Immediately show the first fragment
        onUpdate(currentFragment)

        // Set up the interval for cycling through fragments
        interval = setInterval(() => {
          currentFragment = encoder.nextPart()
          fragmentIndex += 1
          onUpdate(currentFragment)
        }, fragmentInterval)
      },

      // Stop the QR code loop
      stop: () => {
        if (interval) {
          clearInterval(interval)
          interval = null
        }
      },

      // Change the speed of fragment cycling
      changeSpeed: (newInterval: number, onUpdate: (fragment: string) => void) => {
        if (interval) {
          clearInterval(interval)
          interval = setInterval(() => {
            currentFragment = encoder.nextPart()
            fragmentIndex += 1
            onUpdate(currentFragment)
          }, newInterval)
        }
      },

      // Get encoder info
      getInfo: () => ({
        currentIndex: fragmentIndex,
        // We can estimate based on the message size
        estimatedFragments: Math.ceil(messageBuffer.length / fragmentLength),
      }),
    }

    return controller
  }

  /**
   * Creates a decoder for BC-UR fragments
   * @returns A decoder instance with methods to process fragments
   */
  static createDecoder() {
    const decoder = new URDecoder()
    let receivedParts = 0
    let expectedParts = 0

    return {
      // Process a scanned fragment
      receivePart: (fragment: string): boolean => {
        try {
          decoder.receivePart(fragment)
          receivedParts += 1

          // Try to extract expected parts from the fragment
          // BC-UR format includes this information in the fragment
          const match = fragment.match(/ur:bytes\/(\d+)-(\d+)\//)
          if (match) {
            expectedParts = parseInt(match[2], 10)
          }

          return true
        } catch (error) {
          console.error("Error processing BC-UR fragment:", error)
          return false
        }
      },

      // Check if decoding is complete
      isComplete: (): boolean => {
        return decoder.isComplete()
      },

      // Get the decoded token
      getDecodedToken: (): string | null => {
        if (!decoder.isComplete()) {
          return null
        }

        try {
          const ur = decoder.resultUR()
          const buffer = ur.decodeCBOR()
          return buffer.toString("base64")
        } catch (error) {
          console.error("Error decoding BC-UR result:", error)
          return null
        }
      },

      // Get decoder progress
      getProgress: () => ({
        expectedPartCount: decoder.expectedPartCount(),
        receivedPartCount: receivedParts,
        percentComplete:
          expectedParts > 0 ? Math.round((receivedParts / expectedParts) * 100) : 0,
      }),

      // Reset the decoder
      reset: () => {
        // Create a new decoder instance since the library doesn't have a reset method
        const newDecoder = new URDecoder()
        Object.assign(decoder, newDecoder)
        receivedParts = 0
        expectedParts = 0
      },
    }
  }

  /**
   * Validates if a string is a valid BC-UR fragment
   * @param fragment The string to validate
   * @returns True if the string is a valid BC-UR fragment
   */
  static isValidFragment(fragment: string): boolean {
    try {
      // BC-UR fragments start with "ur:"
      return fragment.toLowerCase().startsWith("ur:")
    } catch {
      return false
    }
  }

  /**
   * Estimates the number of fragments needed for a given token
   * @param tokenString The base64 encoded token string
   * @param fragmentLength The fragment length (default: 200)
   * @returns The estimated number of fragments
   */
  static estimateFragmentCount(
    tokenString: string,
    fragmentLength = this.DEFAULT_FRAGMENT_LENGTH,
  ): number {
    const messageBuffer = Buffer.from(tokenString, "base64")
    // Rough estimate based on buffer size and fragment length
    return Math.ceil(messageBuffer.length / fragmentLength)
  }
}

// Export types for convenience
export type BCUREncoder = ReturnType<typeof BCURQRCode.encodeToken>
export type BCURDecoder = ReturnType<typeof BCURQRCode.createDecoder>
