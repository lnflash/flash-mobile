import {
  buildSelectApdu,
  parseBalance,
  parseInfo,
  readCashuCardBalance,
} from "../../app/utils/cashu-card"

const ok = (data: number[]) => [...data, 0x90, 0x00]

describe("cashu-card parser", () => {
  it("parses the GET_INFO body", () => {
    expect(parseInfo([0, 2, 32, 1, 7, 0x07, 1, 0])).toEqual({
      version: "0.2",
      maxSlots: 32,
      unspent: 1,
      spent: 7,
    })
  })

  it("parses the GET_BALANCE body (big-endian sat)", () => {
    expect(parseBalance([0, 0, 0x01, 0xf4])).toBe(500)
    expect(parseBalance([0, 0, 0, 0])).toBe(0)
  })

  it("rejects short bodies", () => {
    expect(() => parseInfo([0, 2])).toThrow(/expected 8 bytes/)
    expect(() => parseBalance([0, 0])).toThrow(/expected 4 bytes/)
  })
})

describe("readCashuCardBalance", () => {
  it("selects, reads info and balance over the IsoDep channel", async () => {
    const sent: number[][] = []
    const transceive = async (bytes: number[]) => {
      sent.push(bytes)
      const ins = bytes[1]
      if (ins === 0xa4) return ok([0, 2])
      if (ins === 0x01) return ok([0, 2, 32, 1, 7, 0x07, 1, 0])
      if (ins === 0x11) return ok([0, 0, 0x01, 0xf4])
      throw new Error("unsupported")
    }

    const info = await readCashuCardBalance(transceive)

    expect(info).toEqual({
      version: "0.2",
      maxSlots: 32,
      unspent: 1,
      spent: 7,
      balanceSat: 500,
    })
    // The applet SELECT goes out first, verbatim.
    expect(sent[0]).toEqual(buildSelectApdu())
  })

  it("a tag without the Cashu applet resolves null (fallback to other flows)", async () => {
    const transceive = async () => [0x6a, 0x82]
    await expect(readCashuCardBalance(transceive)).resolves.toBeNull()
  })

  it("genuine status failures throw", async () => {
    const transceive = async (bytes: number[]) =>
      bytes[1] === 0xa4 ? [0x90, 0x00] : [0x6f, 0x00]
    await expect(readCashuCardBalance(transceive)).rejects.toThrow(/GET_INFO failed/)
  })
})
