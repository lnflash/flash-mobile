import { isPlainObject } from "../engine/schema-validator"
import { FLASH_USERNAME } from "../registry/read/lookup-flash-username"

/** Unlike nip05.queryProfile, retain transport/protocol failures for retry UI. */
export const verifyFlashProfile = async (
  username: string,
  hostname: string,
): Promise<string | null> => {
  if (!FLASH_USERNAME.test(username)) return null
  const name = username.toLowerCase()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(
      `https://${hostname}/.well-known/nostr.json?name=${encodeURIComponent(name)}`,
      { redirect: "manual", signal: controller.signal },
    )
    const body: unknown = await response.json()
    // The Flash NIP-05 endpoint explicitly distinguishes a missing username
    // from upstream failure (502), invalid input (400) and rate limits (429).
    if (response.status === 404 && isPlainObject(body) && body.error === "User not found")
      return null
    if (response.status !== 200 || !isPlainObject(body) || !isPlainObject(body.names))
      throw new Error("Profile verification unavailable")
    if (!Object.prototype.hasOwnProperty.call(body.names, name)) return null
    const pubkey = body.names[name]
    if (typeof pubkey !== "string" || !/^[0-9a-f]{64}$/i.test(pubkey))
      throw new Error("Invalid profile verification response")
    return pubkey
  } finally {
    clearTimeout(timeout)
  }
}
