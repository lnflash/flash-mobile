/**
 * ENG-787: a card names its keyset by 8 bytes; a mint that serves v2 ids
 * (33 bytes) knows it only by its full id. These pin:
 *   - a v1 id the mint lists resolves to itself
 *   - a v2 keyset resolves from its unique 8-byte prefix (Minibits- and
 *     Macadamia-shaped ids)
 *   - a prefix two v2 keysets share is `keyset-ambiguous`; no match is
 *     `keyset-unknown`, never passed through
 *   - wherever the vendored relay's `resolve` names a keyset, this names the
 *     same one, so a top-up and a relayed payment agree on it
 */
import { readFileSync } from "fs"
import { join } from "path"

import {
  KeysetIdError,
  cardPrefix,
  resolveCardKeyset,
} from "../../app/utils/cashu-card-topup"

const V1 = "00cadd580ab9ab9a"
// Shaped like the live Minibits /Bitcoin and Macadamia sat keysets (v2).
const MINIBITS = `01fc0ec0${"3e".repeat(29)}`
const MACADAMIA = `01a13e30${"91".repeat(29)}`
const TWIN = `${MINIBITS.slice(0, 16)}${"d4".repeat(25)}`

const reasonOf = (run: () => unknown): string | undefined => {
  try {
    run()
  } catch (err) {
    return err instanceof KeysetIdError ? err.reason : `not a KeysetIdError: ${err}`
  }
  return undefined
}

/**
 * The vendored relay's own `resolve`, lifted from relay.js as it is pinned
 * (RELAY_PIN.json), over a catalogue of `ids`. A refusal comes back as its
 * code, as the relay's `fail` throws it.
 */
const relayResolve = (ids: string[]) => {
  const source = readFileSync(
    join(__dirname, "../../app/utils/cashu-card-relay/relay.js"),
    "utf8",
  )
  const start = source.indexOf("const resolve = (id) => {")
  const end = source.indexOf("\n  };", start)
  if (start < 0 || end < 0) throw new Error("relay.js no longer has its resolve")
  const body = source.slice(start, end + 4)
  const sets = new Map(ids.map((id) => [id, { id }]))
  const fail = (code: string) => {
    throw Object.assign(new Error(code), { code })
  }
  // eslint-disable-next-line no-new-func
  return new Function("sets", "fail", `${body}\nreturn resolve`)(sets, fail) as (
    id: string,
  ) => string
}

describe("resolveCardKeyset", () => {
  it("resolves a v1 id the mint lists to itself", () => {
    expect(resolveCardKeyset(V1, [V1, MINIBITS])).toBe(V1)
  })

  it("resolves a v2 keyset from the 8 bytes a card slot holds", () => {
    const catalogue = [V1, MINIBITS, MACADAMIA]
    expect(resolveCardKeyset(cardPrefix(MINIBITS), catalogue)).toBe(MINIBITS)
    expect(resolveCardKeyset(cardPrefix(MACADAMIA), catalogue)).toBe(MACADAMIA)
    // A card's hex, whatever its case.
    expect(resolveCardKeyset(cardPrefix(MINIBITS).toUpperCase(), catalogue)).toBe(
      MINIBITS,
    )
  })

  it("resolves a full v2 id to itself", () => {
    expect(resolveCardKeyset(MINIBITS, [MINIBITS, TWIN])).toBe(MINIBITS)
  })

  it("refuses a prefix two v2 keysets share", () => {
    expect(
      reasonOf(() => resolveCardKeyset(cardPrefix(MINIBITS), [MINIBITS, TWIN])),
    ).toBe("keyset-ambiguous")
  })

  it("refuses an id the mint does not list, rather than pass it through", () => {
    expect(reasonOf(() => resolveCardKeyset("00ffffffffffffff", [V1, MINIBITS]))).toBe(
      "keyset-unknown",
    )
    // Not a card id: only an exact match would do.
    expect(reasonOf(() => resolveCardKeyset("01fc0ec0", [MINIBITS]))).toBe(
      "keyset-unknown",
    )
  })

  it("cardPrefix keeps a v1 id whole and cuts a v2 id to 8 bytes", () => {
    expect(cardPrefix(V1)).toBe(V1)
    expect(cardPrefix(MINIBITS)).toBe(MINIBITS.slice(0, 16))
    expect(cardPrefix(MINIBITS.toUpperCase())).toBe(MINIBITS.slice(0, 16))
  })

  describe("parity with the vendored relay's resolve", () => {
    const cases: { name: string; ids: string[]; id: string }[] = [
      { name: "v1 exact", ids: [V1, MINIBITS], id: V1 },
      {
        name: "v2 unique prefix",
        ids: [V1, MINIBITS, MACADAMIA],
        id: cardPrefix(MINIBITS),
      },
      { name: "v2 full id", ids: [MINIBITS, TWIN], id: MINIBITS },
      { name: "shared prefix", ids: [MINIBITS, TWIN], id: cardPrefix(MINIBITS) },
      { name: "unlisted card id", ids: [V1, MACADAMIA], id: cardPrefix(MINIBITS) },
      { name: "unlisted short id", ids: [MINIBITS], id: "01fc0ec0" },
    ]

    cases.forEach(({ name, ids, id }) =>
      it(name, () => {
        let relay: { id?: string; code?: string }
        try {
          relay = { id: relayResolve(ids)(id) }
        } catch (err) {
          relay = { code: (err as { code?: string }).code }
        }
        let mine: { id?: string; code?: string }
        try {
          mine = { id: resolveCardKeyset(id, ids) }
        } catch (err) {
          mine = { code: (err as KeysetIdError).reason }
        }
        if (relay.code) {
          // The relay refuses only an ambiguous prefix; so does this.
          expect(mine).toEqual({ code: relay.code })
        } else if (relay.id !== undefined && ids.includes(relay.id)) {
          // The relay named a listed keyset: the same one.
          expect(mine).toEqual({ id: relay.id })
        } else {
          // The relay passed an unlisted id through (the mint then refuses it):
          // this refuses it here.
          expect(relay.id).toBe(id)
          expect(mine).toEqual({ code: "keyset-unknown" })
        }
      }),
    )
  })
})
