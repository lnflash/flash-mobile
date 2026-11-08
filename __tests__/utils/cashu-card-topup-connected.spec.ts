/**
 * ENG-787: a card is read, priced, topped up, tidied and reclaimed at the
 * mint its own record names, through one client per mint; the Cash wallet
 * funds only the mints on the fund list (forge alone by default).
 */
import {
  CASHU_MINT_URL,
  DEFAULT_CARD_MINTS,
  mintDisplayName,
} from "../../app/config/appinfo"
import { setCardBridge } from "../../app/utils/cashu-card-bridge"
import {
  cardFundMints,
  isFundMint,
  mintOfCard,
  mintOfCardOrUndefined,
  setCardFundMints,
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
  setCardFundMints([])
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

describe("the fund list", () => {
  it("is forge alone until something sets it, and never empty", () => {
    expect(cardFundMints()).toEqual([CASHU_MINT_URL])
    setCardFundMints([])
    expect(cardFundMints()).toEqual([CASHU_MINT_URL])
  })

  it("funds forge, and another mint only once it is listed", () => {
    expect(isFundMint(CASHU_MINT_URL)).toBe(true)
    expect(isFundMint(MINIBITS)).toBe(false)
    setCardFundMints([CASHU_MINT_URL, MINIBITS])
    expect(isFundMint(`${MINIBITS}/`)).toBe(true)
    // Its root, on the same host, is another mint.
    expect(isFundMint("https://mint.minibits.cash")).toBe(false)
  })

  it("judges by the list it is given, an empty one being forge alone", () => {
    expect(isFundMint(MINIBITS, [MINIBITS])).toBe(true)
    expect(isFundMint(MINIBITS, [])).toBe(false)
    expect(isFundMint(CASHU_MINT_URL, [])).toBe(true)
  })

  it("funds the dev bridge's own mint in development, never in a release build", () => {
    setCardBridge({ url: BRIDGE, mintUrl: DEV_MINT })
    expect(isFundMint(DEV_MINT)).toBe(true)
    setDev(false)
    expect(isFundMint(DEV_MINT)).toBe(false)
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
