/**
 * Real Bitcoin mainnet block headers, 180 blocks apart (each more than a day
 * after the one before), as the network carries them: the newest three of
 * cashucard/javacard `spec/vectors/headers.json` at the ref the e2e
 * workflow pins (`CASHU_JAVACARD_REF`), whose newest sets the applet's floor
 * (D24). A card takes them (SET_HEADER, REFRESH, SET_OWNER's anchor); a header
 * mined for a test it would refuse (6A93).
 */
export type HeaderVector = { height: number; time: number; hash: string; header: string }

export const HEADER_VECTORS: HeaderVector[] = [
  {
    height: 970740,
    time: 1791617994,
    hash: "00000000000000000001b0eaa04b94a0e9bb49d716d4cf9e89b2825e2b819b45",
    header:
      "0080e92131f8a4e74c871b6eb2f7993c325b852c668ce832045201000000000000000000966f2f703fbe594069e3872c0f2256c1d26ae353ae5c969a3f46e078e19a6dfacaebc96af01e0217293e4b19",
  },
  {
    height: 970920,
    time: 1791718507,
    hash: "00000000000000000001143323750ecdb4bac6e736e4e494a974090c24f91cd3",
    header:
      "00e0ff3fc81f28235b97dccf4100141a66441997e8a9d11e4add00000000000000000000e75df58c5e5ba5c0cae98d574748b2fe6738376105cb024bad0cf4eaa0ac76ba6b74cb6af01e021761aa0196",
  },
  {
    height: 971100,
    time: 1791814824,
    hash: "0000000000000000000174b1a4526c2718f9891c2c77945ed930a2f18959fe92",
    header:
      "00c0982393d11d01ce3623e775eb87f8f29d9e607bc98779db0602000000000000000000939a3be21aa361da579fa2578895413d925c780a5667f7b9fcf7a4c279648496a8eccc6af01e021776150c1e",
  },
]

export const headerBytes = (vector: HeaderVector): number[] =>
  (vector.header.match(/../g) ?? []).map((h) => parseInt(h, 16))

/**
 * A fetch that answers as an Esplora source does for `vector` as the tip:
 * `/blocks/tip/hash`, then `/block/<hash>/header`. Every URL asked is recorded.
 */
export const esploraFetch = (vector: HeaderVector, asked: string[] = []) =>
  jest.fn(async (url: string) => {
    asked.push(url)
    const text = url.endsWith("/blocks/tip/hash")
      ? vector.hash
      : url.endsWith(`/block/${vector.hash}/header`)
      ? vector.header
      : undefined
    return {
      ok: text !== undefined,
      status: text === undefined ? 404 : 200,
      text: async () => text ?? "",
    }
  })
