jest.mock("@app/screens/send-bitcoin-screen/payment-destination", () => ({
  ...jest.requireActual("@app/screens/send-bitcoin-screen/payment-destination"),
  // The parser reaches LNURL services over the network; each case says what
  // it answers.
  parseDestination: jest.fn(),
}))

import { contactPick, resolvePayee } from "@app/assistant/registry/actions/shared/payee"
import {
  createIntraLedgerDestination,
  createLightningDestination,
  createOnchainDestination,
  parseDestination,
} from "@app/screens/send-bitcoin-screen/payment-destination"
import { InvalidDestinationReason } from "@app/screens/send-bitcoin-screen/payment-destination/index.types"
import {
  createLnurlPaymentDestination,
  createLnurlWithdrawDestination,
} from "@app/screens/send-bitcoin-screen/payment-destination/lnurl"
import { accountsOf, bolt11, fakeActionCtx } from "../fakes"

const parse = parseDestination as jest.Mock

const contact = (username: string, alias: string | null = null) => ({
  __typename: "UserContact",
  id: username,
  username,
  alias,
  transactionsCount: 0,
})

const MINE = ["my-usd", "my-btc"]

/** A Flash user the user has not added (ENG-730). */
const NOT_A_CONTACT = "dreadmax"

const NOT_FOUND = {
  kind: "error",
  replyKey: "Assistant.payeeNotFound",
  card: { type: "prepareRefused", reason: "payeeNotFound" },
}

const setup = (contacts = [contact("alice", "Alice"), contact("jane", "mom")]) => {
  const fake = fakeActionCtx()
  fake.graphql.contacts.mockResolvedValue(contacts)
  // Each contact has an account, and so does dreadmax, who is no contact;
  // any other word is no one's username.
  fake.graphql.accountDefaultWallet.mockImplementation(
    accountsOf([...contacts.map(({ username }) => username), NOT_A_CONTACT]),
  )
  return fake
}

beforeEach(() => {
  parse.mockReset()
})

describe("resolvePayee: a contact the user names", () => {
  it("finds one sure match through resolveContact, never as a Flash username", async () => {
    const { ctx, graphql } = setup()

    const resolved = await resolvePayee("mom", ctx, MINE)

    expect(resolved).toMatchObject({
      kind: "payee",
      payee: {
        kind: "contact",
        label: "mom",
        username: "jane",
        recipientWalletId: "jane-wallet",
      },
    })
    // "mom" was a name, looked up among the contacts only.
    expect(graphql.accountDefaultWallet).toHaveBeenCalledWith("jane")
    expect(graphql.accountDefaultWallet).not.toHaveBeenCalledWith("mom")
    expect(parse).not.toHaveBeenCalled()
  })

  it("asks which contact when it is not sure, each option re-issuing its pick", async () => {
    const { ctx } = setup([contact("alice", "Alice"), contact("alina", "Alina")])

    const resolved = await resolvePayee("ali", ctx, MINE)

    expect(resolved).toEqual({
      kind: "clarification",
      card: {
        type: "clarification",
        prompt: "Assistant.pickContact",
        options: [
          expect.objectContaining({ id: contactPick("alice"), sublabel: "alice" }),
          expect.objectContaining({ id: contactPick("alina"), sublabel: "alina" }),
        ],
        // The words the question is about, for the pick to replace.
        about: "ali",
      },
    })
  })

  it("says it found no one, with the refusal card, when the name is no contact's and no Flash user's", async () => {
    const { ctx, graphql } = setup()

    await expect(resolvePayee("mallory", ctx, MINE)).resolves.toEqual(NOT_FOUND)
    expect(graphql.accountDefaultWallet.mock.calls).toEqual([["mallory"]])
  })

  it("uses an exact verified username without a second recipient picker", async () => {
    const { ctx, graphql } = setup()

    await expect(resolvePayee(NOT_A_CONTACT, ctx, MINE)).resolves.toMatchObject({
      kind: "payee",
      payee: {
        kind: "flashUser",
        username: "dreadmax",
        recipientWalletId: "dreadmax-wallet",
      },
    })
    expect(graphql.accountDefaultWallet.mock.calls).toEqual([["dreadmax"]])
  })

  it("asks about a contact the name looks like, never adding a Flash user of that name", async () => {
    // "jan" is close to jane: her picker, even with a Flash user called jan.
    const { ctx, graphql } = setup()
    graphql.accountDefaultWallet.mockImplementation(accountsOf(["jane", "jan"]))

    const resolved = await resolvePayee("jan", ctx, MINE)

    expect(resolved).toMatchObject({
      kind: "clarification",
      card: { prompt: "Assistant.pickContact", options: [{ id: contactPick("jane") }] },
    })
    expect(resolved.kind === "clarification" && resolved.card.options).toHaveLength(1)
    expect(graphql.accountDefaultWallet).not.toHaveBeenCalled()
  })

  it("refuses a contact whose wallet is the user's own", async () => {
    const { ctx, graphql } = setup()
    graphql.accountDefaultWallet.mockResolvedValue({
      id: "my-usd",
      walletCurrency: "USD",
    })

    await expect(resolvePayee("Alice", ctx, MINE)).resolves.toEqual({
      kind: "error",
      replyKey: "Assistant.selfPayment",
    })
  })

  it("refuses a name too long to be a contact's", async () => {
    const { ctx } = setup()

    await expect(resolvePayee("x".repeat(81), ctx, MINE)).resolves.toEqual({
      kind: "error",
      replyKey: "Assistant.invalidDestination",
    })
  })
})

describe("resolvePayee: a picked contact", () => {
  it("resolves to exactly that contact, so the question is never asked twice", async () => {
    // "alice" alone would match alina too and ask again.
    const { ctx } = setup([contact("alice", "Alice"), contact("alina", "Alina")])

    await expect(resolvePayee(contactPick("alice"), ctx, MINE)).resolves.toMatchObject({
      kind: "payee",
      payee: { kind: "contact", username: "alice", recipientWalletId: "alice-wallet" },
    })
    await expect(resolvePayee("contact:ALINA", ctx, MINE)).resolves.toMatchObject({
      payee: { username: "alina" },
    })
  })

  it("refuses, with the refusal card, a pick that is neither a contact nor a Flash user", async () => {
    const { ctx, graphql } = setup()

    await expect(resolvePayee(contactPick("mallory"), ctx, MINE)).resolves.toEqual(
      NOT_FOUND,
    )
    expect(graphql.accountDefaultWallet.mock.calls).toEqual([["mallory"]])
  })

  it("resolves a pick that is no contact to the Flash user of that username", async () => {
    const { ctx, graphql } = setup()

    const resolved = await resolvePayee(contactPick(NOT_A_CONTACT), ctx, MINE)

    expect(resolved).toMatchObject({
      kind: "payee",
      payee: {
        kind: "flashUser",
        label: "dreadmax",
        username: "dreadmax",
        recipientWalletId: "dreadmax-wallet",
      },
    })
    // Paid as the send screen pays a Flash user: intraledger, to that wallet.
    expect(resolved.kind === "payee" && resolved.payee.destination).toMatchObject({
      valid: true,
      validDestination: {
        paymentType: "intraledger",
        handle: "dreadmax",
        walletId: "dreadmax-wallet",
      },
    })
    expect(graphql.accountDefaultWallet.mock.calls).toEqual([["dreadmax"]])
  })

  it("refuses a picked Flash user whose wallet is the user's own", async () => {
    const { ctx, graphql } = setup()
    graphql.accountDefaultWallet.mockResolvedValue({
      __typename: "PublicWallet",
      id: "my-usd",
      walletCurrency: "USD",
    })

    await expect(resolvePayee(contactPick(NOT_A_CONTACT), ctx, MINE)).resolves.toEqual({
      kind: "error",
      replyKey: "Assistant.selfPayment",
    })
  })

  it("looks a picked Flash user up again at the tap, refusing one who is gone since the question", async () => {
    const { ctx, graphql } = setup()
    ctx.knownUsernames = ["dreadmax"]
    // The spoken name is absent, the suggestion exists, then disappears by the tap.
    graphql.accountDefaultWallet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        __typename: "PublicWallet",
        id: "dreadmax-wallet",
        walletCurrency: "USD",
      })
      .mockResolvedValueOnce(null)

    const asked = await resolvePayee("dreadlocks", ctx, MINE)
    if (asked.kind !== "clarification") throw new Error("expected a question")
    const picked = await resolvePayee(asked.card.options[0].id, ctx, MINE)

    expect(picked).toEqual(NOT_FOUND)
    expect(graphql.accountDefaultWallet.mock.calls).toEqual([
      ["dreadlocks"],
      ["dreadmax"],
      ["dreadmax"],
    ])
  })

  it("never looks up a pick with a space in it: no username has one", async () => {
    const { ctx, graphql } = setup()

    await expect(
      resolvePayee(contactPick("the guy from work"), ctx, MINE),
    ).resolves.toEqual(NOT_FOUND)
    expect(graphql.accountDefaultWallet).not.toHaveBeenCalled()
  })
})

describe("resolvePayee: a destination", () => {
  it("takes a Flash user's Lightning address as that user", async () => {
    const { ctx } = setup()
    parse.mockResolvedValue(
      createIntraLedgerDestination({
        parsedIntraledgerDestination: {
          paymentType: "intraledger",
          handle: "bob",
          valid: true,
        },
        walletId: "bob-wallet",
      }),
    )

    await expect(resolvePayee("bob@flashapp.me", ctx, MINE)).resolves.toMatchObject({
      kind: "payee",
      payee: {
        kind: "flashUser",
        label: "bob",
        username: "bob",
        recipientWalletId: "bob-wallet",
      },
    })
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({ rawInput: "bob@flashapp.me", myWalletIds: MINE }),
    )
  })

  it("takes an LNURL payee by its address, a bolt11 shortened, an address in full", async () => {
    const { ctx } = setup()
    const invoice = bolt11({ id: "inv", sats: 1000 })
    const lnurlParams = {
      min: 1,
      max: 100_000,
      identifier: "carol@blink.sv",
      description: "Pay carol",
      commentAllowed: 0,
      callback: "https://blink.sv/cb",
      domain: "blink.sv",
      metadata: "",
      image: "",
      rawData: {},
      fixed: false,
      metadataHash: "",
    }
    parse.mockResolvedValueOnce(
      createLnurlPaymentDestination({
        paymentType: "lnurl",
        valid: true,
        lnurl: "carol@blink.sv",
        lnurlParams,
      } as never),
    )
    parse.mockResolvedValueOnce(
      createLightningDestination({
        paymentType: "lightning",
        valid: true,
        paymentRequest: invoice,
        amount: 1000,
      } as never),
    )
    parse.mockResolvedValueOnce(
      createOnchainDestination({
        paymentType: "onchain",
        valid: true,
        address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      } as never),
    )

    await expect(resolvePayee("carol@blink.sv", ctx, MINE)).resolves.toMatchObject({
      payee: { kind: "lnurl", label: "carol@blink.sv" },
    })
    const lightning = await resolvePayee(invoice, ctx, MINE)
    expect(lightning).toMatchObject({ payee: { kind: "lightning" } })
    expect(lightning.kind === "payee" && lightning.payee.label).toMatch(
      /^lnbc.{10}….{8}$/,
    )
    await expect(
      resolvePayee("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", ctx, MINE),
    ).resolves.toMatchObject({
      payee: { kind: "onchain", label: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" },
    })
  })

  it("answers the parser's refusals with their replies", async () => {
    const { ctx } = setup()
    const cases: [string, string][] = [
      [InvalidDestinationReason.InvoiceExpired, "Assistant.invoiceExpired"],
      [InvalidDestinationReason.SelfPayment, "Assistant.selfPayment"],
      [InvalidDestinationReason.UnknownLightning, "Assistant.invalidDestination"],
      [InvalidDestinationReason.UsernameDoesNotExist, "Assistant.invalidDestination"],
    ]
    for (const [invalidReason, replyKey] of cases) {
      parse.mockResolvedValueOnce({
        valid: false,
        invalidReason,
        invalidPaymentDestination: {},
      })
      await expect(resolvePayee("lnbc1expired", ctx, MINE)).resolves.toEqual({
        kind: "error",
        replyKey,
      })
    }
  })

  it("refuses an LNURL-withdraw link: it pays the user, there is nothing to send", async () => {
    const { ctx } = setup()
    parse.mockResolvedValue(
      createLnurlWithdrawDestination({
        lnurl: "lnurl1withdraw",
        callback: "https://x/cb",
        domain: "x",
        k1: "k1",
        defaultDescription: "",
        minWithdrawable: 1000,
        maxWithdrawable: 2000,
      }),
    )

    await expect(resolvePayee("lnurl1withdraw", ctx, MINE)).resolves.toEqual({
      kind: "error",
      replyKey: "Assistant.invalidDestination",
    })
  })

  it("parses anything that starts like a payment request, valid or not, never as a name", async () => {
    const { ctx, graphql } = setup()
    parse.mockResolvedValue({
      valid: false,
      invalidReason: InvalidDestinationReason.UnknownDestination,
      invalidPaymentDestination: {},
    })

    await resolvePayee("lnbc10u1p3xyz", ctx, MINE)

    expect(parse).toHaveBeenCalled()
    expect(graphql.contacts).not.toHaveBeenCalled()
  })
})
