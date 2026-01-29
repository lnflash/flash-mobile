// nostr/signer/types.ts
import { Event, EventTemplate } from "nostr-tools"

export interface NostrSigner {
  getPublicKey(): Promise<string>
  signEvent(event: EventTemplate): Promise<Event>

  /**
   * Returns the nsec-encoded secret key for backup/display purposes.
   * Optional since remote signers (NIP-46) won't have access to the raw key.
   */
  getSecretKeyNsec?(): Promise<string>

  nip04: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }

  nip44: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
}
