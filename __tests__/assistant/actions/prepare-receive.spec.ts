import { validateCard } from "@app/assistant/cards/types"
import {
  DEFAULT_RECEIVE_MEMO,
  prepareReceiveRun,
  PrepareReceiveArgs,
} from "@app/assistant/registry/actions/prepare-receive"
import type { ToolResult } from "@app/assistant/registry/types"
import { BreezSdkNotInitializedError } from "@app/utils/breez-sdk/sdk-errors"
import { bolt11, fakeActionCtx, JMD_PRICE, NOW_MS, USD_PRICE, wallet } from "../fakes"

const BTC_ROW = wallet({
  __typename: "BTCWallet",
  id: "my-btc",
  walletCurrency: "BTC",
  balance: null as never,
  isExternal: true,
})

const ADDRESS = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"

const setup = (display: "USD" | "JMD" = "USD") => {
  const fake = fakeActionCtx({ displayCurrency: display })
  fake.graphql.wallets.mockResolvedValue([
    wallet({ id: "my-usd", walletCurrency: "USD", balance: 0 }),
    BTC_ROW,
  ])
  fake.graphql.realtimePrice.mockResolvedValue(display === "USD" ? USD_PRICE : JMD_PRICE)
  fake.btcRail.getBalanceSats.mockResolvedValue({ state: "ok", sats: 0 })
  return fake
}

const answer = (result: ToolResult<unknown>) => {
  if (result.kind !== "answer")
    throw new Error(`not an answer: ${JSON.stringify(result)}`)
  const validation = validateCard(result.payload)
  if (!validation.valid) throw new Error(`invalid card: ${JSON.stringify(validation)}`)
  return result.payload
}

const run = (args: PrepareReceiveArgs, fake: ReturnType<typeof setup>) =>
  prepareReceiveRun(args, fake.ctx)

/** Nothing on the custodial rail, and no send of any kind, was touched. */
const expectNoGraphqlRequest = (fake: ReturnType<typeof setup>) => {
  expect(fake.actions.lnUsdInvoiceCreate).not.toHaveBeenCalled()
  expect(fake.actions.onChainAddressCurrent).not.toHaveBeenCalled()
  Object.values(fake.mutations).forEach((trigger) =>
    expect(trigger).not.toHaveBeenCalled(),
  )
}

describe("prepareReceive", () => {
  it("BTC Lightning: a bolt11 from the BTC rail, never a server-side invoice", async () => {
    const fake = setup()
    const invoice = bolt11({ id: "btc-in", sats: 10_000, expirySeconds: 3_600 })
    fake.btcRail.createInvoice.mockResolvedValue({
      paymentRequest: invoice,
      fee: BigInt(0),
    })

    const card = answer(
      await run({ wallet: "BTC", amount: "0.0001", currency: "BTC", memo: "Tea" }, fake),
    )

    expect(fake.btcRail.createInvoice).toHaveBeenCalledWith(10_000, "Tea")
    expect(fake.btcRail.getOnchainAddress).not.toHaveBeenCalled()
    expectNoGraphqlRequest(fake)
    expect(card).toEqual({
      type: "invoice",
      // The receive screen's QR holds the invoice upper-cased; Share sends it as it is.
      paymentRequest: invoice.toUpperCase(),
      shareText: invoice,
      amountText: "BTC 10000 (USD 630)",
      receiveWallet: "BTC",
      method: "lightning",
      expiresAt: NOW_MS + 3_600_000,
    })
  })

  it("BTC Lightning with no amount asks the rail for none", async () => {
    const fake = setup()
    fake.btcRail.createInvoice.mockResolvedValue({
      paymentRequest: bolt11({ id: "open" }),
    })

    const card = answer(await run({ wallet: "BTC" }, fake))

    expect(fake.btcRail.createInvoice).toHaveBeenCalledWith(
      undefined,
      DEFAULT_RECEIVE_MEMO,
    )
    expect(card).not.toHaveProperty("amountText")
  })

  it("BTC on-chain: the BTC wallet's address from the rail, as a BIP21 request in bitcoin", async () => {
    const fake = setup()
    fake.btcRail.getOnchainAddress.mockResolvedValue({ paymentRequest: ADDRESS })

    const card = answer(
      await run(
        {
          wallet: "BTC",
          method: "onchain",
          amount: "0.0005",
          currency: "BTC",
          memo: "Rent",
        },
        fake,
      ),
    )

    expect(fake.btcRail.getOnchainAddress).toHaveBeenCalledWith()
    expect(fake.btcRail.createInvoice).not.toHaveBeenCalled()
    expectNoGraphqlRequest(fake)
    expect(card).toMatchObject({
      shareText: `bitcoin:${ADDRESS}?amount=0.0005&message=Rent`,
      paymentRequest: `bitcoin:${ADDRESS}?amount=0.0005&message=Rent`.toUpperCase(),
      receiveWallet: "BTC",
      method: "onchain",
    })
    // An address does not expire.
    expect(card).not.toHaveProperty("expiresAt")
  })

  it("USD Lightning: lnUsdInvoiceCreate in cents, expiring when the invoice does (5 minutes)", async () => {
    const fake = setup()
    const invoice = bolt11({ id: "usd-in", expirySeconds: 300 })
    fake.actions.lnUsdInvoiceCreate.mockResolvedValue({ paymentRequest: invoice })

    const card = answer(await run({ amount: "12.50", currency: "USD" }, fake))

    expect(fake.actions.lnUsdInvoiceCreate).toHaveBeenCalledWith({
      walletId: "my-usd",
      amount: 1_250,
      memo: DEFAULT_RECEIVE_MEMO,
    })
    expect(fake.btcRail.createInvoice).not.toHaveBeenCalled()
    expect(fake.actions.onChainAddressCurrent).not.toHaveBeenCalled()
    expect(card).toMatchObject({
      receiveWallet: "USD",
      method: "lightning",
      amountText: "USD 1250",
      expiresAt: NOW_MS + 300_000,
    })
  })

  it("USD Lightning with no amount asks for 0", async () => {
    const fake = setup()
    fake.actions.lnUsdInvoiceCreate.mockResolvedValue({
      paymentRequest: bolt11({ id: "u0" }),
    })

    answer(await run({}, fake))

    expect(fake.actions.lnUsdInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ walletId: "my-usd", amount: 0 }),
    )
  })

  it("USD on-chain: onChainAddressCurrent, the request carrying no amount", async () => {
    const fake = setup()
    fake.actions.onChainAddressCurrent.mockResolvedValue(ADDRESS)

    const card = answer(
      await run({ method: "onchain", amount: "50", currency: "USD" }, fake),
    )

    expect(fake.actions.onChainAddressCurrent).toHaveBeenCalledWith("my-usd")
    expect(fake.actions.lnUsdInvoiceCreate).not.toHaveBeenCalled()
    expect(fake.btcRail.getOnchainAddress).not.toHaveBeenCalled()
    expect(card).toMatchObject({
      shareText: `bitcoin:${ADDRESS}?message=${encodeURIComponent(
        encodeURIComponent(DEFAULT_RECEIVE_MEMO),
      )}`,
      amountText: "USD 5000",
      method: "onchain",
    })
  })

  it("reads a bare amount in the display currency and asks the wallet for its equivalent", async () => {
    const fake = setup("JMD")
    fake.actions.lnUsdInvoiceCreate.mockResolvedValue({
      paymentRequest: bolt11({ id: "j" }),
    })

    const card = answer(await run({ amount: "785" }, fake))

    expect(fake.actions.lnUsdInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500 }),
    )
    expect(card).toMatchObject({ amountText: "JMD 78500 (USD 500)" })
  })

  it("answers a BTC wallet that is not running with its reply, asking nothing of it", async () => {
    const fake = setup()
    fake.btcRail.getBalanceSats.mockResolvedValue({ state: "syncing" })

    await expect(run({ wallet: "BTC" }, fake)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.btcSyncing",
    })
    expect(fake.btcRail.createInvoice).not.toHaveBeenCalled()
  })

  it("answers the rail's not-running error, should the wallet stop in between, with its reply", async () => {
    const fake = setup()
    fake.btcRail.createInvoice.mockRejectedValue(
      new BreezSdkNotInitializedError({ reason: "off" }),
    )

    await expect(run({ wallet: "BTC" }, fake)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.btcDisabled",
    })
  })

  it("lets any other failure through, for runTool to report", async () => {
    const fake = setup()
    fake.actions.lnUsdInvoiceCreate.mockRejectedValue(new Error("Network request failed"))

    await expect(run({}, fake)).rejects.toThrow("Network request failed")
  })
})
