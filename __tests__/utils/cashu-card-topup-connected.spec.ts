/**
 * ENG-787: a card is read, priced, topped up, tidied and reclaimed at the
 * mint its own record names, through one client per mint. ENG-831: there is
 * no fund list; `isForgeMint` only decides the till note.
 */
import {
  CASHU_MINT_URL,
  DEFAULT_CARD_MINTS,
  mintDisplayName,
} from "../../app/config/appinfo"
import { setCardBridge } from "../../app/utils/cashu-card-bridge"
import * as connected from "../../app/utils/cashu-card-topup/connected"
import {
  isForgeMint,
  mintOfCard,
  mintOfCardOrUndefined,
  topUpMint,
} from "../../app/utils/cashu-card-topup/connected"
import { TopUpError } from "../../app/utils/cashu-card-topup"

const MINIBITS = "https://mint.minibits.cash/Bitcoin"
const BRIDGE = "http://localhost:9876"
const DEV_MINT = "http://localhost:3338"

type Dev = { __DEV__: boolean }
const setDev = (value: boolean) => {
  ;(globalThis as unknown as Dev).__DEV__ = value
}

afterEach(() => {
  setDev(true)
  setCardBridge(undefined)
})

describe("mintOfCard", () => {
  it("is the record's own mint once the record is set, path and all", () => {
    expect(mintOfCard({ recordSet: true, mint: `${MINIBITS}/` })).toBe(MINIBITS)
    expect(mintOfCard({ recordSet: true, mint: "https://forge.flashapp.me" })).toBe(
      CASHU_MINT_URL,
    )
  })

  it("is the app's card mint for a card never set up: forge, or the dev mint", () => {
    expect(mintOfCard({ recordSet: false, mint: "" })).toBe(CASHU_MINT_URL)
    setCardBridge({ url: BRIDGE, mintUrl: DEV_MINT })
    expect(mintOfCard({ recordSet: false, mint: "" })).toBe(DEV_MINT)
  })

  it("refuses a record mint this app cannot use, and never swaps in another", () => {
    ;[
      "http://mint.test",
      "https://u@mint.test",
      "not a mint",
      "https://mïnt.test",
    ].forEach((mint) => {
      expect(() => mintOfCard({ recordSet: true, mint })).toThrow(TopUpError)
      expect(mintOfCardOrUndefined({ recordSet: true, mint })).toBeUndefined()
    })
    expect(mintOfCardOrUndefined(undefined)).toBeUndefined()
  })

  it("takes an http record mint only while a dev bridge is set", () => {
    expect(mintOfCardOrUndefined({ recordSet: true, mint: DEV_MINT })).toBeUndefined()
    setCardBridge({ url: BRIDGE, mintUrl: DEV_MINT })
    expect(mintOfCard({ recordSet: true, mint: DEV_MINT })).toBe(DEV_MINT)
    setDev(false)
    expect(mintOfCardOrUndefined({ recordSet: true, mint: DEV_MINT })).toBeUndefined()
  })
})

describe("topUpMint", () => {
  it("keeps one client per mint, two spellings of a mint sharing it", () => {
    const minibits = topUpMint(MINIBITS)
    expect(minibits.url).toBe(MINIBITS)
    expect(topUpMint(`${MINIBITS.toUpperCase()}/`)).toBe(minibits)
    expect(topUpMint("https://mint.minibits.cash")).not.toBe(minibits)
    expect(topUpMint(CASHU_MINT_URL)).not.toBe(minibits)
  })
})

describe("no fund list (ENG-831)", () => {
  it("exports no fence: no fund list, no setter, no isFundMint", () => {
    expect(Object.keys(connected)).not.toEqual(expect.arrayContaining(["cardFundMints"]))
    expect("setCardFundMints" in connected).toBe(false)
    expect("isFundMint" in connected).toBe(false)
  })

  it("calls forge, in any spelling, a forge mint, and no other mint", () => {
    expect(isForgeMint(CASHU_MINT_URL)).toBe(true)
    expect(isForgeMint("https://Forge.flashapp.me/")).toBe(true)
    expect(isForgeMint(MINIBITS)).toBe(false)
    expect(isForgeMint("https://mint.macadamia.cash")).toBe(false)
  })

  it("never calls the dev bridge's mint forge: tills do not take it either", () => {
    setCardBridge({ url: BRIDGE, mintUrl: DEV_MINT })
    expect(isForgeMint(DEV_MINT)).toBe(false)
  })
})

describe("mintDisplayName", () => {
  it("names a listed mint by its own name, any other by its host, never its path", () => {
    expect(mintDisplayName(CASHU_MINT_URL)).toBe("Flash")
    expect(mintDisplayName("https://Forge.flashapp.me/")).toBe("Flash")
    expect(mintDisplayName(MINIBITS)).toBe("Minibits")
    expect(mintDisplayName("https://mint.macadamia.cash")).toBe("Macadamia")
    expect(mintDisplayName("https://mint.cubabitcoin.org")).toBe("Cuba")
    expect(mintDisplayName("https://Other.Mint.example/Some/Path")).toBe(
      "other.mint.example",
    )
    // The Minibits host without its path is not the listed mint.
    expect(mintDisplayName("https://mint.minibits.cash")).toBe("mint.minibits.cash")
  })

  it("lists forge first, and every listed mint passes the card's own check", () => {
    expect(DEFAULT_CARD_MINTS[0]).toEqual({ url: CASHU_MINT_URL, name: "Flash" })
    DEFAULT_CARD_MINTS.forEach(({ url }) =>
      expect(mintOfCard({ recordSet: true, mint: url })).toBe(url),
    )
  })
})
