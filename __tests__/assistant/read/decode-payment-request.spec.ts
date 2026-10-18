jest.mock("js-lnurl", () => ({
  ...jest.requireActual("js-lnurl"),
  getParams: jest.fn(),
}))
jest.mock("lnurl-pay", () => ({
  ...jest.requireActual("lnurl-pay"),
  requestPayServiceParams: jest.fn(),
}))

import { getParams } from "js-lnurl"
import { requestPayServiceParams } from "lnurl-pay"

import { GraphqlRailError } from "@app/assistant/rails/graphql-rail"
import { decodePaymentRequest } from "@app/assistant/registry/read/decode-payment-request"
import { toBtcMoneyAmount } from "@app/types/amounts"
import { failingAccountLookup, fakeCtx, wallet } from "../fakes"

// Real mainnet invoices (see __tests__/screens/send-confirmation.spec.tsx).
// The parser refuses an expired invoice, so each case pins the clock inside
// the invoice's minute.
const NO_AMOUNT_INVOICE = {
  paymentRequest:
    "lnbc1p4gwtwwpp5wwulk8jw0llvgjadwzuen6nxh7hgmddplj3evpgjc7n8l5kzqvmqdph2pshjgr5dusyvmrpwd5zq4mpd3kx2apq24ek2u36ypj8yetpv3kkz7qcqzzsxqzpusp5wane88x5twmdlpnu4cqrk4wd6g3tks7xgq798nt9zt68vmcnnp6q9qxpqysgqnszg0ycjk4255es2hdd3ajep3yquuvra6jn4k8shskhpzg80mrl9m9pgylahzq80aw9ekz6e47ycpcf558080xrxn6uljn54lc447rqpn9u06u",
  issued: 1787243982,
  expires: 1787244042,
}
const AMOUNT_INVOICE = {
  paymentRequest:
    "lnbc14060n1p4gclcjpp555k59jc4xn0x3mej3gzmuj7lg66u0rtkq73vtvwqtrmd8luemprqdpvvejk2ttswfhkyefqwejhy6txd93kzarfdahzqgek8y6qcqzzsxqzpusp5rprrqnqhclwmc7au9vqf306mg6wndelar076yu6f8nr7md6kzv9q9qxpqysgqnpc09nfh90rew3z7d06pu3056nu24e809j5sj6qn0ytquu252h0sp2dkd6gc3qudwduecfvxw7m6vlt6mc0s3seqv0nvet4u9xpq6wsqfhuttw",
  issued: 1787592466,
  expires: 1787592526,
  sats: 1406,
}
const ADDRESS = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
const LNURL =
  "LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS"

const decode = async (raw: string) => {
  const setup = fakeCtx()
  setup.graphql.wallets.mockResolvedValue([wallet({ id: "my-usd-wallet" })])
  setup.graphql.accountDefaultWallet.mockImplementation(async (username: string) =>
    username === "nobody"
      ? null
      : {
          __typename: "PublicWallet",
          id: username === "myself" ? "my-usd-wallet" : `${username}-wallet`,
          walletCurrency: "USD",
        },
  )
  const result = await decodePaymentRequest.run({ raw }, setup.ctx)
  return { result, ...setup }
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe("decodePaymentRequest", () => {
  it("reads an invoice's amount and its own expiry", async () => {
    jest.spyOn(Date, "now").mockReturnValue((AMOUNT_INVOICE.issued + 5) * 1000)

    const { result } = await decode(AMOUNT_INVOICE.paymentRequest)

    expect(result).toEqual({
      kind: "answer",
      payload: {
        valid: true,
        direction: "send",
        destinationType: "lightning",
        amount: toBtcMoneyAmount(AMOUNT_INVOICE.sats),
        expiresAt: AMOUNT_INVOICE.expires,
        payee: null,
      },
    })
  })

  it("reads an invoice with no amount as having none", async () => {
    jest.spyOn(Date, "now").mockReturnValue((NO_AMOUNT_INVOICE.issued + 4) * 1000)

    const { result } = await decode(NO_AMOUNT_INVOICE.paymentRequest)

    expect(result).toMatchObject({
      payload: {
        destinationType: "lightning",
        amount: null,
        expiresAt: NO_AMOUNT_INVOICE.expires,
      },
    })
  })

  it("reports an expired invoice as invalid, as the send flow does", async () => {
    jest.spyOn(Date, "now").mockReturnValue((NO_AMOUNT_INVOICE.expires + 600) * 1000)

    const { result } = await decode(NO_AMOUNT_INVOICE.paymentRequest)

    expect(result).toEqual({
      kind: "answer",
      payload: { valid: false, reason: "InvoiceExpired" },
    })
  })

  it("reads an on-chain address, and a BIP21 amount in sats", async () => {
    await expect(decode(ADDRESS)).resolves.toMatchObject({
      result: {
        payload: {
          valid: true,
          destinationType: "onchain",
          amount: null,
          expiresAt: null,
          payee: ADDRESS,
        },
      },
    })
    await expect(decode(`bitcoin:${ADDRESS}?amount=0.0001`)).resolves.toMatchObject({
      result: {
        payload: { destinationType: "onchain", amount: toBtcMoneyAmount(10_000) },
      },
    })
  })

  it("reads a Flash username through the GraphQL rail", async () => {
    const { result, graphql } = await decode("alice")

    expect(graphql.accountDefaultWallet).toHaveBeenCalledWith("alice")
    expect(result).toEqual({
      kind: "answer",
      payload: {
        valid: true,
        direction: "send",
        destinationType: "intraledger",
        amount: null,
        expiresAt: null,
        payee: "alice",
      },
    })
  })

  it("reports an unknown username and a payment to yourself as invalid", async () => {
    await expect(decode("nobody")).resolves.toMatchObject({
      result: { payload: { valid: false, reason: "UsernameDoesNotExist" } },
    })
    await expect(decode("myself")).resolves.toMatchObject({
      result: { payload: { valid: false, reason: "SelfPayment" } },
    })
  })

  it("reads a handle the server's Username pattern refuses as no one's, without asking the server", async () => {
    // The parser passes "LNBC1abc" as a handle: @flash/client's reUsername
    // minds the case of the lnbc1 start, and the server's UsernameRegex does
    // not, so the server answers its lookup with an error, which the rail
    // reads as a failed lookup, not as no account (ENG-730 review).
    const { result, graphql } = await decode("LNBC1abc")

    expect(result).toMatchObject({
      payload: { valid: false, reason: "UsernameDoesNotExist" },
    })
    expect(graphql.accountDefaultWallet).not.toHaveBeenCalled()
  })

  it("fails when the server fails a username's lookup, never calling the username unknown", async () => {
    // A GraphQL error on an HTTP 200 for an account that may exist
    // (DB_ERROR), through the real rail: a failed read, which runTool
    // answers with Assistant.toolFailed (ENG-730 review).
    const { ctx, graphql } = fakeCtx()
    graphql.wallets.mockResolvedValue([wallet({ id: "my-usd-wallet" })])
    graphql.accountDefaultWallet.mockImplementation(failingAccountLookup())

    await expect(decodePaymentRequest.run({ raw: "alice" }, ctx)).rejects.toThrow(
      GraphqlRailError,
    )
  })

  it("reads a fixed-amount Lightning address", async () => {
    ;(getParams as jest.Mock).mockResolvedValue({ tag: "payRequest" })
    ;(requestPayServiceParams as jest.Mock).mockResolvedValue({
      callback: "https://example.com/cb",
      fixed: true,
      min: 500,
      max: 500,
      domain: "example.com",
      identifier: "shop@example.com",
      metadata: [],
      metadataHash: "",
      description: "",
      image: "",
      commentAllowed: 0,
      rawData: {},
    })

    const { result } = await decode("shop@example.com")

    expect(result).toEqual({
      kind: "answer",
      payload: {
        valid: true,
        direction: "send",
        destinationType: "lnurl",
        amount: toBtcMoneyAmount(500),
        expiresAt: null,
        payee: "shop@example.com",
      },
    })
  })

  it("reads an LNURL withdraw as money coming in", async () => {
    ;(getParams as jest.Mock).mockResolvedValue({
      tag: "withdrawRequest",
      callback: "https://atm.example/cb",
      domain: "atm.example",
      k1: "k1",
      defaultDescription: "",
      minWithdrawable: 1000,
      maxWithdrawable: 250_000,
    })

    const { result } = await decode(LNURL)

    expect(result).toEqual({
      kind: "answer",
      payload: {
        valid: true,
        direction: "receive",
        destinationType: "lnurlWithdraw",
        amount: toBtcMoneyAmount(250),
        payee: "atm.example",
      },
    })
  })

  it("reports what it cannot read as invalid", async () => {
    await expect(decode("hello world!!")).resolves.toMatchObject({
      result: { payload: { valid: false, reason: "UnknownDestination" } },
    })
  })

  it("decodes only: it pays nothing and hands back nothing that could", async () => {
    jest.spyOn(Date, "now").mockReturnValue((AMOUNT_INVOICE.issued + 5) * 1000)

    const { result, btcRail } = await decode(AMOUNT_INVOICE.paymentRequest)

    expect(btcRail.payInvoice).not.toHaveBeenCalled()
    expect(btcRail.payLnurl).not.toHaveBeenCalled()
    expect(btcRail.payOnchain).not.toHaveBeenCalled()
    // Plain data: the parser's createPaymentDetail builder is not in it.
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
    expect(JSON.stringify(result)).not.toMatch(/createPaymentDetail/)
  })

  it("projects the payload as it is, with no memo", async () => {
    jest.spyOn(Date, "now").mockReturnValue((AMOUNT_INVOICE.issued + 5) * 1000)
    const { result } = await decode(AMOUNT_INVOICE.paymentRequest)
    if (result.kind !== "answer") throw new Error("expected an answer")

    expect(decodePaymentRequest.project(result.payload, { raw: "" })).toEqual(
      result.payload,
    )
    expect(result.payload).not.toHaveProperty("memo")
  })
})
