// nostr/signer/localSigner.ts
import { getPublicKey, signEvent, nip04, nip44 } from "nostr-tools"
import { EventTemplate } from "nostr-tools"
import { NostrSigner } from "./types"

export class LocalSigner implements NostrSigner {
  constructor(private readonly sk: Uint8Array) {}

  async getPublicKey() {
    return getPublicKey(this.sk)
  }

  async signEvent(event: EventTemplate) {
    return signEvent(event, this.sk)
  }

  nip04 = {
    encrypt: async (pubkey: string, plaintext: string) =>
      nip04.encrypt(this.sk, pubkey, plaintext),

    decrypt: async (pubkey: string, ciphertext: string) =>
      nip04.decrypt(this.sk, pubkey, ciphertext),
  }

  nip44 = {
    encrypt: async (pubkey: string, plaintext: string) => {
      const conversationKey = nip44.v2.utils.getConversationKey(
        bytestToHex(this.sk),
        pubkey,
      )
      return nip44.v2.encrypt(plaintext, conversationKey)
    },

    decrypt: async (pubkey: string, ciphertext: string) => {
      const conversationKey = nip44.v2.utils.getConversationKey(
        bytestToHex(this.sk),
        pubkey,
      )
      return nip44.v2.decrypt(ciphertext, conversationKey)
    },
  }
}
function bytestToHex(sk: Uint8Array<ArrayBufferLike>): string {
  throw new Error("Function not implemented.")
}
