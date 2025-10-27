import { nip19, getPublicKey, finalizeEvent } from "nostr-tools"
import { hexToBytes } from "@noble/hashes/utils"

/**
 * Generate NIP-98 HTTP Auth header for nostr.build API
 */
async function generateNIP98AuthHeader(
  url: string,
  method: string,
  nsec: string,
): Promise<string> {
  try {
    const decoded = nip19.decode(nsec)
    const privateKey = decoded.data as Uint8Array
    const publicKey = getPublicKey(privateKey)

    const authEvent = {
      kind: 27235, // NIP-98 HTTP Auth
      pubkey: publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["u", url],
        ["method", method],
      ],
      content: "",
    }

    const signedAuthEvent = await finalizeEvent(authEvent, privateKey)
    const encodedAuth = btoa(JSON.stringify(signedAuthEvent))
    return `Nostr ${encodedAuth}`
  } catch (error) {
    console.error("Error generating NIP-98 auth:", error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to generate auth header: ${message}`)
  }
}

/**
 * Upload media file to nostr.build using NIP-98 authentication
 * @param mediaUri - Local file URI (file://...)
 * @param flashNostrNsec - FLASH_NOSTR_NSEC from env config
 * @param isVideo - Whether the file is a video (default: false)
 * @returns Uploaded media URL
 */
export async function uploadToNostrBuild(
  mediaUri: string,
  flashNostrNsec: string,
  isVideo: boolean = false,
): Promise<string> {
  try {
    console.log("Uploading media to nostr.build:", mediaUri, "isVideo:", isVideo)

    const uploadUrl = "https://nostr.build/api/v2/upload/files"
    const authHeader = await generateNIP98AuthHeader(uploadUrl, "POST", flashNostrNsec)

    const formData = new FormData()
    formData.append("file", {
      uri: mediaUri,
      type: isVideo ? "video/mp4" : "image/jpeg",
      name: isVideo ? "video.mp4" : mediaUri.endsWith(".svg") ? "image.svg" : "photo.jpg",
    } as any)

    const response = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
      headers: {
        Authorization: authHeader,
      },
    })

    console.log("Upload response status:", response.status)
    const data = await response.json()
    console.log("Upload response data:", JSON.stringify(data, null, 2))

    if (data.status === "success" && data.data && data.data.length > 0) {
      const uploadedUrl = data.data[0].url
      console.log("Extracted URL:", uploadedUrl)
      return uploadedUrl
    }

    throw new Error("Upload failed: no URL found in response")
  } catch (error) {
    console.error("Error uploading media to nostr.build:", error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to upload media: ${message}`)
  }
}
