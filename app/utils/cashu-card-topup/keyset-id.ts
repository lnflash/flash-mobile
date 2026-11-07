/**
 * A card's keyset id and the mint's (ENG-787).
 *
 * A card slot holds a keyset id as 8 raw bytes (spec/APDU.md): a NUT-02 v1 id
 * whole, or the first 8 bytes of a v2 id (33 bytes, `01` ‖ 64 hex), which is
 * all a mint that serves v2 ids is known by on the card. Everything sent to
 * the mint carries its full id; only LOAD_PROOF and the ladder, which read
 * and write slots, use the card's.
 *
 * `resolveCardKeyset` mirrors `resolve` in the vendored assisted-settlement
 * relay (`cashu-card-relay/relay.js`), so a card's id names the same keyset
 * on a top-up and on a relayed payment. It differs only where the relay
 * passes an id through unresolved: here no match is refused.
 */

/** Why a card's keyset id names no single keyset of the mint's. */
export type KeysetIdReason = "keyset-ambiguous" | "keyset-unknown"

export class KeysetIdError extends Error {
  constructor(readonly reason: KeysetIdReason, message: string) {
    super(message)
    this.name = "KeysetIdError"
  }
}

const CARD_ID = /^[0-9a-f]{16}$/
const V2_ID = /^[0-9a-f]{66}$/

/** The id a card slot holds for keyset `id`: its first 8 bytes. */
export const cardPrefix = (id: string): string => id.slice(0, 16).toLowerCase()

/**
 * The one id in `mintIds` that card id `cardId` names: the id itself when the
 * mint lists it (a v1 id), else the unique v2 id it is the prefix of. Two
 * such v2 ids throw `keyset-ambiguous`; none throws `keyset-unknown`.
 */
export const resolveCardKeyset = (cardId: string, mintIds: readonly string[]): string => {
  const id = cardId.toLowerCase()
  if (mintIds.includes(id)) return id
  const found = CARD_ID.test(id)
    ? mintIds.filter((k) => typeof k === "string" && V2_ID.test(k) && k.startsWith(id))
    : []
  if (found.length > 1) {
    throw new KeysetIdError(
      "keyset-ambiguous",
      `card keyset ${id} is the prefix of ${found.length} of the mint's keysets`,
    )
  }
  if (found.length === 0) {
    throw new KeysetIdError("keyset-unknown", `the mint lists no keyset ${id}`)
  }
  return found[0]
}
