// Contract test for work order 03 (flash-onchain-send). Written by Claude; the
// worker makes it pass without changing it.
//
// Ask Flash pays a fixed-sat on-chain request from the cash wallet as the Send
// screen pays it (payment-details/onchain.ts): the request's own sats through
// onChainUsdPaymentSendAsBtcDenominated, its fee probed through
// onChainUsdTxFeeAsBtcDenominated. The cash wallet's on-chain floor is the
// server's 5,500 sats: a fixed request is held to its sats, an amount in
// dollars to what 5,500 sats are worth.
jest.mock("@app/screens/send-bitcoin-screen/payment-destination", () => ({
  ...jest.requireActual("@app/screens/send-bitcoin-screen/payment-destination"),
  // The parser reaches LNURL services over the network; each case says what
  // it answers.
  parseDestination: jest.fn(),
}))

import {
  prepareSendRun,
  PrepareSendArgs,
} from "@app/assistant/registry/actions/prepare-send"
import type {
  ExecuteContext,
  PreparedAction,
  ToolResult,
} from "@app/assistant/registry/types"
import { PaymentSendResult } from "@app/graphql/generated"
import {
  createOnchainDestination,
  parseDestination,
} from "@app/screens/send-bitcoin-screen/payment-destination"
import { resetIdempotencyKeySupport } from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import { accountsOf, fakeActionCtx, USD_PRICE, wallet } from "../fakes"

const parse = parseDestination as jest.Mock

const BTC_ROW = wallet({
  __typename: "BTCWallet",
  id: "my-btc",
  walletCurrency: "BTC",
  balance: null as never,
  isExternal: true,
})

/** $100 in the cash wallet at US$63,000 a bitcoin: 0.063 cents a sat. */
const setup = () => {
  const fake = fakeActionCtx({ displayCurrency: "USD" })
  fake.graphql.wallets.mockResolvedValue([
    wallet({ id: "my-usd", walletCurrency: "USD", balance: 10_000 }),
    BTC_ROW,
  ])
  fake.graphql.realtimePrice.mockResolvedValue(USD_PRICE)
  fake.graphql.contacts.mockResolvedValue([])
  fake.graphql.accountDefaultWallet.mockImplementation(accountsOf([]))
  fake.btcRail.getBalanceSats.mockResolvedValue({ state: "ok", sats: 1_000_000 })
  return fake
}

const prepared = (result: ToolResult<unknown>): PreparedAction => {
  if (result.kind !== "prepared")
    throw new Error(`not prepared: ${JSON.stringify(result)}`)
  return result.preparedAction
}

const confirmCtx = (action: PreparedAction): ExecuteContext => ({
  attempt: action.attempt,
  journalDispatch: jest.fn(async (_key: string | null): Promise<void> => undefined),
})

const sentOk = (mutation: string) => ({
  data: { [mutation]: { status: PaymentSendResult.Success, errors: [] } },
})

const ADDRESS = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"

const onchainDestination = (amount?: number) =>
  createOnchainDestination({
    paymentType: "onchain",
    valid: true,
    address: ADDRESS,
    ...(amount === undefined ? {} : { amount }),
  } as never)

const run = (args: PrepareSendArgs, fake: ReturnType<typeof setup>) =>
  prepareSendRun(args, fake.ctx)

/** The fee the server quotes for the request, in cents of the cash wallet. */
const feeInCents = (fake: ReturnType<typeof setup>, cents: number) =>
  fake.actions.feeProbes.onChainUsdTxFeeAsBtcDenominated.mockResolvedValue({
    data: { onChainUsdTxFeeAsBtcDenominated: { amount: cents } },
  })

beforeEach(() => {
  parse.mockReset()
  resetIdempotencyKeySupport()
})

describe("prepareSend to an on-chain request that fixes its sats, from the cash wallet", () => {
  it("prepares a card for the request's own sats, its fee probed in sats", async () => {
    const fake = setup()
    parse.mockResolvedValue(onchainDestination(50_000))
    feeInCents(fake, 120)

    const action = prepared(
      await run({ payee: `bitcoin:${ADDRESS}?amount=0.0005` }, fake),
    )

    const probe = fake.actions.feeProbes.onChainUsdTxFeeAsBtcDenominated
    expect(probe).toHaveBeenCalledTimes(1)
    expect(probe.mock.calls[0][0]).toMatchObject({
      variables: { walletId: "my-usd", address: ADDRESS, amount: 50_000 },
    })
    expect(fake.actions.feeProbes.onChainUsdTxFee).not.toHaveBeenCalled()
    // 50,000 sats are 3,150 cents at US$63,000 a bitcoin, 3,166 with the
    // server's 0.5% margin rounded up; the fee is 120 cents.
    expect(action.summary).toMatchObject({
      amountText: "USD 3166",
      feeText: "USD 120",
      totalText: "USD 3286",
    })
    expect(action.dispatch?.match).toEqual({ kind: "onchain", address: ADDRESS })
  })

  it("sends the request's own sats through onChainUsdPaymentSendAsBtcDenominated", async () => {
    const fake = setup()
    parse.mockResolvedValue(onchainDestination(50_000))
    feeInCents(fake, 120)
    fake.mutations.onChainUsdPaymentSendAsBtcDenominated.mockResolvedValue(
      sentOk("onChainUsdPaymentSendAsBtcDenominated"),
    )

    const action = prepared(
      await run({ payee: `bitcoin:${ADDRESS}?amount=0.0005` }, fake),
    )
    await expect(action.execute(confirmCtx(action))).resolves.toEqual({
      status: "succeeded",
    })

    const send = fake.mutations.onChainUsdPaymentSendAsBtcDenominated
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].variables.input).toMatchObject({
      walletId: "my-usd",
      address: ADDRESS,
      amount: 50_000,
    })
    expect(fake.mutations.onChainUsdPaymentSend).not.toHaveBeenCalled()
  })

  it("refuses a request that fixes fewer than 5,500 sats, before probing a fee", async () => {
    const fake = setup()
    parse.mockResolvedValue(onchainDestination(5_499))
    feeInCents(fake, 120)

    await expect(
      run({ payee: `bitcoin:${ADDRESS}?amount=0.00005499` }, fake),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.onchainBelowMinimum",
    })
    expect(fake.actions.feeProbes.onChainUsdTxFeeAsBtcDenominated).not.toHaveBeenCalled()
  })

  it("prepares a request that fixes exactly 5,500 sats", async () => {
    const fake = setup()
    parse.mockResolvedValue(onchainDestination(5_500))
    feeInCents(fake, 120)

    prepared(await run({ payee: `bitcoin:${ADDRESS}?amount=0.000055` }, fake))

    expect(
      fake.actions.feeProbes.onChainUsdTxFeeAsBtcDenominated.mock.calls[0][0],
    ).toMatchObject({ variables: { amount: 5_500 } })
  })
})

describe("prepareSend on-chain from the cash wallet, an amount in dollars", () => {
  it("holds it to what 5,500 sats are worth: US$3.46 is refused, US$3.47 is prepared", async () => {
    // 5,500 sats are 346.5 cents at US$63,000 a bitcoin: the floor is 347 cents.
    const fake = setup()
    parse.mockResolvedValue(onchainDestination())
    fake.actions.feeProbes.onChainUsdTxFee.mockResolvedValue({
      data: { onChainUsdTxFee: { amount: 120 } },
    })

    await expect(
      run({ payee: ADDRESS, amount: "3.46", currency: "USD" }, fake),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.onchainBelowMinimum",
    })
    expect(fake.actions.feeProbes.onChainUsdTxFee).not.toHaveBeenCalled()

    prepared(await run({ payee: ADDRESS, amount: "3.47", currency: "USD" }, fake))
    expect(fake.actions.feeProbes.onChainUsdTxFee.mock.calls[0][0]).toMatchObject({
      variables: { walletId: "my-usd", address: ADDRESS, amount: 347 },
    })
  })

  it("refuses US$2.50, which the old US$2.00 floor let through", async () => {
    const fake = setup()
    parse.mockResolvedValue(onchainDestination())

    await expect(
      run({ payee: ADDRESS, amount: "2.50", currency: "USD" }, fake),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.onchainBelowMinimum",
    })
  })
})
