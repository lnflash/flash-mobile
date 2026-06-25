import { generateSecretKey } from "nostr-tools"
import { bytesToHex } from "@noble/hashes/utils"
import { getSigner, NostrSigner } from "@app/nostr/signer"
import { pool } from "@app/utils/nostr/pool"
import { GroupMetadataInput } from "./GroupChatProvider"

const now = () => Math.floor(Date.now() / 1000)

/**
 * Publish an already-signed event to NIP-29 relays, answering the relay's
 * NIP-42 AUTH challenge with a signature from the same key. Group writes
 * (create/metadata/moderation) require auth on groups.0xchat.com.
 */
export async function publishSignedWithAuth(
  event: any,
  relayUrls: string[],
  signer: NostrSigner,
  userPublicKey: string,
) {
  return Promise.allSettled(
    pool.publish(relayUrls, event, {
      onauth: async (template: any) =>
        (await signer.signEvent({ ...template, pubkey: userPublicKey } as any)) as any,
    }),
  )
}

/**
 * Create a new NIP-29 group. Publishes the create event (kind 9007) and, if any
 * metadata was provided, an edit-metadata event (kind 9002). The relay makes the
 * creator a `king` and a member automatically — we intentionally do NOT self-add
 * via kind 9000, which would overwrite the king role with an unrecognized label.
 * Returns the new group id.
 */
export async function createNip29Group(
  userPublicKey: string,
  relayUrls: string[],
  metadata: GroupMetadataInput,
): Promise<string> {
  const signer = await getSigner()
  const newGroupId = bytesToHex(generateSecretKey().slice(0, 8))

  const createEvent = await signer.signEvent({
    kind: 9007,
    created_at: now(),
    tags: [["h", newGroupId]],
    content: "",
    pubkey: userPublicKey,
  } as any)
  await publishSignedWithAuth(createEvent, relayUrls, signer, userPublicKey)

  const metaTags: string[][] = [["h", newGroupId]]
  if (metadata.name !== undefined) metaTags.push(["name", metadata.name])
  if (metadata.about !== undefined) metaTags.push(["about", metadata.about])
  if (metadata.picture !== undefined) metaTags.push(["picture", metadata.picture])
  if (metaTags.length > 1) {
    const metaEvent = await signer.signEvent({
      kind: 9002,
      created_at: now() + 1,
      tags: metaTags,
      content: "",
      pubkey: userPublicKey,
    } as any)
    await publishSignedWithAuth(metaEvent, relayUrls, signer, userPublicKey)
  }

  return newGroupId
}
