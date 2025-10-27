import RNFS from "react-native-fs"

/**
 * Mulberry32 PRNG - deterministic random number generator
 * Takes a seed and returns a function that generates random numbers
 */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Generate a seed number from a string (pubkey)
 */
function hashStringToSeed(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

/**
 * Generate HSL color from random values
 */
function generateHSLColor(random: () => number): string {
  const hue = Math.floor(random() * 360)
  const saturation = 60 + Math.floor(random() * 30) // 60-90%
  const lightness = 45 + Math.floor(random() * 20) // 45-65%
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

/**
 * Convert HSL to RGB hex color
 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))

  const r = Math.round(255 * f(0))
  const g = Math.round(255 * f(8))
  const b = Math.round(255 * f(4))

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

/**
 * Fetch RoboHash avatar for a given pubkey
 * Downloads the image and returns the local file URI
 */
export async function generateRoboHashAvatar(pubkey: string): Promise<string> {
  try {
    const url = `https://robohash.org/${pubkey}?set=set1&size=400x400`
    console.log("Fetching RoboHash avatar from:", url)

    const tempPath = `${RNFS.CachesDirectoryPath}/robohash_${Date.now()}.png`

    const download = await RNFS.downloadFile({
      fromUrl: url,
      toFile: tempPath,
      connectionTimeout: 30000, // 30 seconds to establish connection
      readTimeout: 60000, // 60 seconds to download the image
    }).promise

    if (download.statusCode !== 200) {
      throw new Error(`Failed to download RoboHash avatar: HTTP ${download.statusCode}`)
    }

    console.log("RoboHash avatar downloaded to:", tempPath)
    return `file://${tempPath}`
  } catch (error) {
    console.error("Error generating RoboHash avatar:", error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to generate avatar: ${message}`)
  }
}

/**
 * Generate a deterministic gradient banner based on pubkey
 * Creates an SVG and saves it as a file, returns the file URI
 */
export async function generateGradientBanner(pubkey: string): Promise<string> {
  try {
    console.log("Generating gradient banner for pubkey:", pubkey.slice(0, 16) + "...")

    // Create seeded random number generator
    const seed = hashStringToSeed(pubkey)
    const random = mulberry32(seed)

    // Generate 3 colors for the gradient
    const h1 = Math.floor(random() * 360)
    const s1 = 60 + Math.floor(random() * 30)
    const l1 = 45 + Math.floor(random() * 20)
    const color1 = hslToHex(h1, s1, l1)

    const h2 = Math.floor(random() * 360)
    const s2 = 60 + Math.floor(random() * 30)
    const l2 = 45 + Math.floor(random() * 20)
    const color2 = hslToHex(h2, s2, l2)

    const h3 = Math.floor(random() * 360)
    const s3 = 60 + Math.floor(random() * 30)
    const l3 = 45 + Math.floor(random() * 20)
    const color3 = hslToHex(h3, s3, l3)

    console.log("Generated gradient colors:", { color1, color2, color3 })

    // Create SVG gradient
    const svgString = `<svg width="1500" height="500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${color2};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${color3};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="1500" height="500" fill="url(#grad)" />
</svg>`

    // Save SVG to file
    const tempPath = `${RNFS.CachesDirectoryPath}/gradient_banner_${Date.now()}.svg`
    await RNFS.writeFile(tempPath, svgString, "utf8")

    console.log("Gradient banner saved to:", tempPath)
    return `file://${tempPath}`
  } catch (error) {
    console.error("Error generating gradient banner:", error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to generate banner: ${message}`)
  }
}
