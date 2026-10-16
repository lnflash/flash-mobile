import type { ApolloClient } from "@apollo/client"

import {
  AccountStatusDocument,
  BankAccountsDocument,
  InitiateCashoutDocument,
  LnInvoiceFeeProbeDocument,
  LnNoAmountInvoiceFeeProbeDocument,
  LnNoAmountUsdInvoiceFeeProbeDocument,
  LnUsdInvoiceCreateDocument,
  LnUsdInvoiceFeeProbeDocument,
  OnChainAddressCurrentDocument,
  OnChainTxFeeDocument,
  OnChainUsdTxFeeAsBtcDenominatedDocument,
  OnChainUsdTxFeeDocument,
  RequestCashoutDocument,
} from "@app/graphql/generated"
import { createGraphqlActionRail } from "@app/assistant/rails/graphql-action-rail"
import { GraphqlRailError } from "@app/assistant/rails/graphql-rail"

const fakeClient = () => {
  const query = jest.fn()
  const mutate = jest.fn()
  return { query, mutate, client: { query, mutate } as unknown as ApolloClient<unknown> }
}

const OFFER = {
  __typename: "CashoutOffer",
  offerId: "offer-1",
  walletId: "usd-1",
  send: 10_000,
  flashFee: 200,
  receiveUsd: 9_800,
  receiveJmd: null,
  exchangeRate: null,
  expiresAt: 1_760_000_600_000,
}

describe("createGraphqlActionRail", () => {
  describe("feeProbes", () => {
    const mutations: [string, unknown][] = [
      ["lnInvoiceFeeProbe", LnInvoiceFeeProbeDocument],
      ["lnNoAmountInvoiceFeeProbe", LnNoAmountInvoiceFeeProbeDocument],
      ["lnNoAmountUsdInvoiceFeeProbe", LnNoAmountUsdInvoiceFeeProbeDocument],
      ["lnUsdInvoiceFeeProbe", LnUsdInvoiceFeeProbeDocument],
    ]
    mutations.forEach(([name, document]) =>
      it(`${name} runs its own probe mutation with the variables given, and no refetch`, async () => {
        const { mutate, client } = fakeClient()
        const answer = { data: { [name]: { amount: 3, errors: [] } } }
        mutate.mockResolvedValue(answer)
        const variables = { input: { paymentRequest: "lnbc1...", walletId: "usd-1" } }

        const probe = createGraphqlActionRail(client).feeProbes[
          name as "lnInvoiceFeeProbe"
        ] as unknown as (options: unknown) => Promise<unknown>
        await expect(probe({ variables })).resolves.toBe(answer)

        expect(mutate).toHaveBeenCalledTimes(1)
        expect(mutate.mock.calls[0][0]).toEqual({ mutation: document, variables })
      }),
    )

    const queries: [string, unknown][] = [
      ["onChainTxFee", OnChainTxFeeDocument],
      ["onChainUsdTxFee", OnChainUsdTxFeeDocument],
      ["onChainUsdTxFeeAsBtcDenominated", OnChainUsdTxFeeAsBtcDenominatedDocument],
    ]
    queries.forEach(([name, document]) =>
      it(`${name} reads its own fee query from the network`, async () => {
        const { query, client } = fakeClient()
        const answer = { data: { [name]: { amount: 120 } } }
        query.mockResolvedValue(answer)
        const variables = { walletId: "usd-1", address: "bc1q", amount: 500 }

        const probe = createGraphqlActionRail(client).feeProbes[
          name as "onChainTxFee"
        ] as unknown as (options: unknown) => Promise<unknown>
        await expect(probe({ variables })).resolves.toBe(answer)

        expect(query).toHaveBeenCalledWith({
          query: document,
          variables,
          fetchPolicy: "network-only",
        })
      }),
    )
  })

  it("creates a USD invoice and hands back the invoice", async () => {
    const { mutate, client } = fakeClient()
    const invoice = {
      paymentHash: "hash",
      paymentRequest: "lnbc1usd",
      paymentSecret: "secret",
      satoshis: 0,
    }
    mutate.mockResolvedValue({ data: { lnUsdInvoiceCreate: { errors: [], invoice } } })
    const input = { walletId: "usd-1", amount: 500, memo: "lunch" }

    await expect(createGraphqlActionRail(client).lnUsdInvoiceCreate(input)).resolves.toBe(
      invoice,
    )
    expect(mutate).toHaveBeenCalledWith({
      mutation: LnUsdInvoiceCreateDocument,
      variables: { input },
    })
  })

  it("rejects with the server's message when the invoice was refused, or not made", async () => {
    const { mutate, client } = fakeClient()
    const rail = createGraphqlActionRail(client)
    mutate.mockResolvedValueOnce({
      data: {
        lnUsdInvoiceCreate: { errors: [{ message: "Limit reached" }], invoice: null },
      },
    })
    mutate.mockResolvedValueOnce({
      data: { lnUsdInvoiceCreate: { errors: [], invoice: null } },
    })

    await expect(
      rail.lnUsdInvoiceCreate({ walletId: "usd-1", amount: 0 }),
    ).rejects.toMatchObject({ name: "GraphqlRailError", message: "Limit reached" })
    await expect(
      rail.lnUsdInvoiceCreate({ walletId: "usd-1", amount: 0 }),
    ).rejects.toBeInstanceOf(GraphqlRailError)
  })

  it("reads a wallet's current on-chain address, refusing an empty answer", async () => {
    const { mutate, client } = fakeClient()
    const rail = createGraphqlActionRail(client)
    mutate.mockResolvedValueOnce({
      data: { onChainAddressCurrent: { errors: [], address: "bc1qcurrent" } },
    })
    mutate.mockResolvedValueOnce({
      data: { onChainAddressCurrent: { errors: [], address: null } },
    })

    await expect(rail.onChainAddressCurrent("usd-1")).resolves.toBe("bc1qcurrent")
    expect(mutate.mock.calls[0][0]).toEqual({
      mutation: OnChainAddressCurrentDocument,
      variables: { input: { walletId: "usd-1" } },
    })
    await expect(rail.onChainAddressCurrent("usd-1")).rejects.toBeInstanceOf(
      GraphqlRailError,
    )
  })

  it("reads bankPayout from the server, from the network, false unless it says true", async () => {
    const { query, client } = fakeClient()
    const rail = createGraphqlActionRail(client)
    const account = (capabilities: unknown) => ({
      data: { me: { defaultAccount: { id: "a1", capabilities } } },
    })
    query.mockResolvedValueOnce(account({ bankPayout: true, verified: true }))
    query.mockResolvedValueOnce(account({ bankPayout: false }))
    query.mockResolvedValueOnce({ data: { me: { defaultAccount: { id: "a1" } } } })

    await expect(rail.accountCapabilities()).resolves.toEqual({ bankPayout: true })
    await expect(rail.accountCapabilities()).resolves.toEqual({ bankPayout: false })
    // An account type the server gives no capabilities cannot settle.
    await expect(rail.accountCapabilities()).resolves.toEqual({ bankPayout: false })
    expect(query).toHaveBeenCalledWith({
      query: AccountStatusDocument,
      fetchPolicy: "network-only",
    })
  })

  it("refuses to read capabilities or bank accounts for a signed-out session", async () => {
    const { query, client } = fakeClient()
    const rail = createGraphqlActionRail(client)
    query.mockResolvedValue({ data: { me: null } })

    await expect(rail.accountCapabilities()).rejects.toBeInstanceOf(GraphqlRailError)
    await expect(rail.bankAccounts()).rejects.toBeInstanceOf(GraphqlRailError)
  })

  it("reads the settle screen's bank accounts from the network", async () => {
    const { query, client } = fakeClient()
    const accounts = [
      { id: "jm-1", bankName: "NCB", accountNumber: "1234567", currency: "JMD" },
    ]
    query.mockResolvedValue({ data: { me: { id: "u1", bankAccounts: accounts } } })

    await expect(createGraphqlActionRail(client).bankAccounts()).resolves.toBe(accounts)
    expect(query).toHaveBeenCalledWith({
      query: BankAccountsDocument,
      fetchPolicy: "network-only",
    })
  })

  it("requests a settlement offer, rejecting with the server's message when there is none", async () => {
    const { mutate, client } = fakeClient()
    const rail = createGraphqlActionRail(client)
    const input = { amount: 10_000, bankAccountId: "jm-1", walletId: "usd-1" }
    mutate.mockResolvedValueOnce({
      data: { requestCashout: { errors: [], offer: OFFER } },
    })
    mutate.mockResolvedValueOnce({
      data: { requestCashout: { errors: [{ message: "Too small" }], offer: null } },
    })

    await expect(rail.requestCashout(input)).resolves.toBe(OFFER)
    expect(mutate.mock.calls[0][0]).toEqual({
      mutation: RequestCashoutDocument,
      variables: { input },
    })
    await expect(rail.requestCashout(input)).rejects.toMatchObject({
      message: "Too small",
    })
  })

  it("hands back initiateCashout's answer as it is, errors and codes included", async () => {
    const { mutate, client } = fakeClient()
    const rail = createGraphqlActionRail(client)
    const used = {
      id: null,
      errors: [
        { code: "OFFER_ALREADY_EXECUTED", message: "This offer has already been used." },
      ],
    }
    mutate.mockResolvedValueOnce({ data: { initiateCashout: used } })

    await expect(
      rail.initiateCashout({ offerId: "offer-1", walletId: "usd-1" }),
    ).resolves.toBe(used)
    expect(mutate.mock.calls[0][0]).toEqual({
      mutation: InitiateCashoutDocument,
      variables: { input: { offerId: "offer-1", walletId: "usd-1" } },
    })
  })

  it("lets a dropped response reject, so execute() can tell it from an answer", async () => {
    const { mutate, client } = fakeClient()
    mutate.mockRejectedValue(new Error("Network request failed"))

    await expect(
      createGraphqlActionRail(client).initiateCashout({ offerId: "o", walletId: "w" }),
    ).rejects.toThrow("Network request failed")
  })
})
