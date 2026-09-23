/**
 * useBankAccounts — the Settings → Bank accounts hub model.
 *
 * Contract under test:
 *  - ERPNext (local) and Bridge external accounts are grouped by RAIL (the
 *    server keeps one default per rail, not per currency), default-first; the
 *    Bridge virtual account is the single receive account.
 *  - The SERVER owns the default (`isDefault` on both rails) — there is no
 *    client-side default store.
 *  - setDefault / remove call the mutation that matches the account's source
 *    with the right input shape, then refetch that source's list query so the
 *    shared Apollo cache (hub + cash-out picker) is fresh.
 *  - Payload errors and thrown errors come back as { ok: false } with the
 *    server code, and are exposed through the per-action state.
 *  - canRemove is true for erpnext + bridge-external, false for the receive
 *    (bridge-virtual) account.
 *  - With the Bridge flag off, no Bridge query runs; local accounts still load.
 */

import * as React from "react"
import { PropsWithChildren } from "react"
import { MockedProvider, MockedResponse } from "@apollo/client/testing"
import { act, renderHook } from "@testing-library/react-hooks"

import {
  BankAccountDeleteDocument,
  BankAccountSetDefaultDocument,
  BankAccountsDocument,
  BridgeDeleteExternalAccountDocument,
  BridgeExternalAccountsDocument,
  BridgeKycStatusDocument,
  BridgeSetDefaultExternalAccountDocument,
  BridgeVirtualAccountDocument,
} from "@app/graphql/generated"

let mockBridgeTopupEnabled = true
jest.mock("@app/config/feature-flags-context", () => ({
  useFeatureFlags: () => ({ bridgeTopupEnabled: mockBridgeTopupEnabled }),
}))

import { useBankAccounts } from "@app/screens/settings-screen/bank-accounts/use-bank-accounts"
import { BankAccountVM } from "@app/screens/settings-screen/bank-accounts/types"

type Bank = { id: string; currency: string; isDefault: boolean; accountNumber: string }

const bank = (overrides: Partial<Bank> & { id: string }) => ({
  __typename: "BankAccount",
  accountName: null,
  accountNumber: "000011112222",
  accountType: "Savings",
  bankBranch: "Half Way Tree",
  bankName: "NCB",
  currency: "JMD",
  isDefault: false,
  pendingUpdate: null,
  ...overrides,
})

const external = (id: string, isDefault: boolean, last4 = "6789") => ({
  __typename: "BridgeExternalAccount",
  accountNumberLast4: last4,
  bankName: "Chase",
  id,
  isDefault,
  status: "active",
})

const bankAccountsMock = (accounts: Record<string, unknown>[]): MockedResponse => ({
  request: { query: BankAccountsDocument },
  result: {
    data: { me: { __typename: "User", id: "user-1", bankAccounts: accounts } },
  },
})

const externalAccountsMock = (
  accounts: ReturnType<typeof external>[],
): MockedResponse => ({
  request: { query: BridgeExternalAccountsDocument },
  result: { data: { bridgeExternalAccounts: accounts } },
})

const kycMock = (status = "approved"): MockedResponse => ({
  request: { query: BridgeKycStatusDocument },
  result: { data: { bridgeKycStatus: status } },
})

const virtualAccountMock: MockedResponse = {
  request: { query: BridgeVirtualAccountDocument },
  result: {
    data: {
      bridgeVirtualAccount: {
        __typename: "BridgeVirtualAccount",
        accountNumber: "9876543210",
        accountNumberLast4: "3210",
        bankName: "Lead Bank",
        id: "va-1",
        kycLink: null,
        message: null,
        pending: false,
        routingNumber: "101019644",
        tosLink: null,
      },
    },
  },
}

const initialBanks = [
  bank({ id: "jm-1", accountNumber: "11110001" }),
  bank({ id: "jm-2", accountNumber: "11110002", isDefault: true }),
  bank({ id: "us-local", accountNumber: "22220003", currency: "usd" }),
]
const initialExternals = [
  external("ext-1", false, "1111"),
  external("ext-2", true, "2222"),
]

const baseMocks = (): MockedResponse[] => [
  kycMock(),
  virtualAccountMock,
  externalAccountsMock(initialExternals),
  bankAccountsMock(initialBanks),
]

const renderBankAccounts = (mocks: MockedResponse[]) => {
  const wrapper = ({ children }: PropsWithChildren) => (
    <MockedProvider mocks={mocks}>{children}</MockedProvider>
  )
  return renderHook(() => useBankAccounts(), { wrapper })
}

const findAccount = (
  result: { current: ReturnType<typeof useBankAccounts> },
  id: string,
): BankAccountVM => {
  const account = result.current.withdrawGroups
    .flatMap((group) => group.accounts)
    .find((a) => a.id === id)
  if (!account) throw new Error(`account ${id} not in withdrawGroups`)
  return account
}

// Both rails load independently; wait on the merged account count rather than
// on the group count.
const accountCount = (result: { current: ReturnType<typeof useBankAccounts> }) =>
  result.current.withdrawGroups.flatMap((group) => group.accounts).length
const ALL_ACCOUNTS = 5

beforeEach(() => {
  mockBridgeTopupEnabled = true
})

describe("useBankAccounts — merge", () => {
  it("groups by rail, US first, default first", async () => {
    const { result, waitFor } = renderBankAccounts(baseMocks())
    await waitFor(() => {
      expect(accountCount(result)).toBe(ALL_ACCOUNTS)
    })

    expect(result.current.withdrawGroups).toHaveLength(2)
    const [usGroup, localGroup] = result.current.withdrawGroups
    expect(usGroup.rail).toBe("us")
    expect(usGroup.accounts.map((a) => a.id)).toEqual(["ext-2", "ext-1"])
    // The local USD account shares the ERPNext default with the JMD accounts,
    // so it belongs with them — not with the Bridge USD accounts.
    expect(localGroup.rail).toBe("local")
    expect(localGroup.accounts.map((a) => a.id)).toEqual(["jm-2", "jm-1", "us-local"])
    expect(findAccount(result, "us-local").currency).toBe("USD")

    expect(findAccount(result, "jm-1")).toMatchObject({
      key: "erpnext-jm-1",
      source: "erpnext",
      role: "withdraw",
      last4: "0001",
      bankBranch: "Half Way Tree",
      accountType: "Savings",
      status: "verified",
    })
    expect(findAccount(result, "ext-1")).toMatchObject({
      key: "bridge-ext-1",
      source: "bridge-external",
      last4: "1111",
      currency: "USD",
    })
  })

  it("takes the default from the server flags on both rails", async () => {
    const { result, waitFor } = renderBankAccounts(baseMocks())
    await waitFor(() => {
      expect(accountCount(result)).toBe(ALL_ACCOUNTS)
    })

    expect(findAccount(result, "jm-2").isDefault).toBe(true)
    expect(findAccount(result, "jm-1").isDefault).toBe(false)
    expect(findAccount(result, "us-local").isDefault).toBe(false)
    expect(findAccount(result, "ext-2").isDefault).toBe(true)
    expect(findAccount(result, "ext-1").isDefault).toBe(false)
  })

  it("never shows two defaults in one group: Bridge default + ERPNext USD default", async () => {
    // Both rails pay out in USD and both have a server default. Grouped by
    // currency they collided into one radio group with two radios on.
    const { result, waitFor } = renderBankAccounts([
      kycMock(),
      virtualAccountMock,
      externalAccountsMock(initialExternals),
      bankAccountsMock([
        bank({ id: "jm-1", accountNumber: "11110001" }),
        bank({
          id: "us-local",
          accountNumber: "22220003",
          currency: "USD",
          isDefault: true,
        }),
      ]),
    ])
    await waitFor(() => {
      expect(accountCount(result)).toBe(4)
    })

    expect(findAccount(result, "ext-2").isDefault).toBe(true)
    expect(findAccount(result, "us-local").isDefault).toBe(true)
    for (const group of result.current.withdrawGroups) {
      expect(group.accounts.filter((a) => a.isDefault)).toHaveLength(1)
      // One rail per group, so a set-default never reaches into another group.
      expect(new Set(group.accounts.map((a) => a.source)).size).toBe(1)
    }
    const local = result.current.withdrawGroups.find((g) => g.rail === "local")
    expect(local?.accounts.map((a) => a.id)).toEqual(["us-local", "jm-1"])
  })

  it("marks nothing default when the server flags nothing (no client fallback)", async () => {
    const { result, waitFor } = renderBankAccounts([
      kycMock(),
      virtualAccountMock,
      externalAccountsMock([]),
      bankAccountsMock([bank({ id: "jm-1" }), bank({ id: "jm-2" })]),
    ])
    await waitFor(() => {
      expect(result.current.withdrawGroups).toHaveLength(1)
    })

    expect(result.current.withdrawGroups[0].accounts.map((a) => a.isDefault)).toEqual([
      false,
      false,
    ])
  })

  it("sets canRemove for erpnext + bridge-external, not the receive account", async () => {
    const { result, waitFor } = renderBankAccounts(baseMocks())
    await waitFor(() => {
      expect(result.current.receiveAccount).not.toBeNull()
    })
    await waitFor(() => {
      expect(accountCount(result)).toBe(ALL_ACCOUNTS)
    })

    expect(findAccount(result, "jm-1")).toMatchObject({
      canRemove: true,
      canSetDefault: true,
    })
    expect(findAccount(result, "ext-1")).toMatchObject({
      canRemove: true,
      canSetDefault: true,
    })
    expect(result.current.receiveAccount).toMatchObject({
      source: "bridge-virtual",
      canRemove: false,
      canSetDefault: false,
      accountNumber: "9876543210",
      routingNumber: "101019644",
    })
  })

  it("surfaces a legacy pending update as the account status", async () => {
    const pendingUpdate = {
      __typename: "BankAccountUpdateRequest",
      status: "Pending",
      bankName: "NCB",
      bankBranch: "New Kingston",
      accountType: "Savings",
      accountNumber: "11119999",
      currency: "JMD",
      rejectionReason: null,
    }
    const { result, waitFor } = renderBankAccounts([
      kycMock("not_started"),
      bankAccountsMock([{ ...bank({ id: "jm-1", isDefault: true }), pendingUpdate }]),
    ])
    await waitFor(() => {
      expect(result.current.withdrawGroups).toHaveLength(1)
    })

    expect(findAccount(result, "jm-1").status).toBe("pending")
  })

  it("skips every Bridge query when the flag is off; local accounts still load", async () => {
    mockBridgeTopupEnabled = false
    // Bridge mocks ARE provided (and would report "approved"), so the only way
    // these resolvers stay uncalled is the hook skipping the queries.
    const kyc = jest.fn(() => ({ data: { bridgeKycStatus: "approved" } }))
    const externals = jest.fn(() => ({
      data: { bridgeExternalAccounts: initialExternals },
    }))
    const { result, waitFor } = renderBankAccounts([
      { request: { query: BridgeKycStatusDocument }, result: kyc },
      { request: { query: BridgeExternalAccountsDocument }, result: externals },
      virtualAccountMock,
      bankAccountsMock(initialBanks),
    ])
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(kyc).not.toHaveBeenCalled()
    expect(externals).not.toHaveBeenCalled()
    expect(result.current.kycApproved).toBe(false)
    expect(result.current.receiveAccount).toBeNull()
    expect(
      result.current.withdrawGroups.flatMap((g) => g.accounts).map((a) => a.source),
    ).toEqual(["erpnext", "erpnext", "erpnext"])
  })
})

describe("useBankAccounts — setDefault", () => {
  it("erpnext: calls bankAccountSetDefault, then refetches BankAccounts", async () => {
    const mutation = jest.fn(() => ({
      data: {
        bankAccountSetDefault: {
          __typename: "BankAccountPayload",
          errors: [],
          bankAccount: bank({ id: "jm-1", accountNumber: "11110001", isDefault: true }),
        },
      },
    }))
    const { result, waitFor } = renderBankAccounts([
      ...baseMocks(),
      {
        request: {
          query: BankAccountSetDefaultDocument,
          variables: { input: { bankAccountId: "jm-1" } },
        },
        result: mutation,
      },
      // The awaited refetch — the server moved the default to jm-1.
      bankAccountsMock([
        bank({ id: "jm-1", accountNumber: "11110001", isDefault: true }),
        bank({ id: "jm-2", accountNumber: "11110002" }),
      ]),
    ])
    await waitFor(() => {
      expect(accountCount(result)).toBe(ALL_ACCOUNTS)
    })

    let outcome
    await act(async () => {
      outcome = await result.current.setDefault(findAccount(result, "jm-1"))
    })

    expect(outcome).toEqual({ ok: true })
    expect(mutation).toHaveBeenCalledTimes(1)
    // Fresh list from the refetch: new default, reordered, us-local gone.
    const jmd = result.current.withdrawGroups.find((g) => g.rail === "local")
    expect(jmd?.accounts.map((a) => [a.id, a.isDefault])).toEqual([
      ["jm-1", true],
      ["jm-2", false],
    ])
    expect(result.current.setDefaultState).toEqual({
      loading: false,
      accountKey: "erpnext-jm-1",
      error: undefined,
    })
  })

  it("bridge-external: calls bridgeSetDefaultExternalAccount, then refetches the list", async () => {
    const mutation = jest.fn(() => ({
      data: {
        bridgeSetDefaultExternalAccount: {
          __typename: "BridgeSetDefaultExternalAccountPayload",
          errors: [],
          externalAccount: {
            __typename: "BridgeExternalAccount",
            id: "ext-1",
            isDefault: true,
          },
        },
      },
    }))
    const { result, waitFor } = renderBankAccounts([
      ...baseMocks(),
      {
        request: {
          query: BridgeSetDefaultExternalAccountDocument,
          variables: { input: { externalAccountId: "ext-1" } },
        },
        result: mutation,
      },
      externalAccountsMock([external("ext-1", true, "1111"), external("ext-2", false)]),
    ])
    await waitFor(() => {
      expect(accountCount(result)).toBe(ALL_ACCOUNTS)
    })

    let outcome
    await act(async () => {
      outcome = await result.current.setDefault(findAccount(result, "ext-1"))
    })

    expect(outcome).toEqual({ ok: true })
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(findAccount(result, "ext-1").isDefault).toBe(true)
    expect(findAccount(result, "ext-2").isDefault).toBe(false)
  })

  it("returns the server error code and exposes it in setDefaultState", async () => {
    const { result, waitFor } = renderBankAccounts([
      ...baseMocks(),
      {
        request: {
          query: BankAccountSetDefaultDocument,
          variables: { input: { bankAccountId: "jm-1" } },
        },
        result: {
          data: {
            bankAccountSetDefault: {
              __typename: "BankAccountPayload",
              errors: [
                {
                  __typename: "GraphQLApplicationError",
                  code: "BANK_ACCOUNT_NOT_FOUND",
                  message: "not found",
                },
              ],
              bankAccount: null,
            },
          },
        },
      },
      bankAccountsMock(initialBanks),
    ])
    await waitFor(() => {
      expect(accountCount(result)).toBe(ALL_ACCOUNTS)
    })

    let outcome
    await act(async () => {
      outcome = await result.current.setDefault(findAccount(result, "jm-1"))
    })

    expect(outcome).toEqual({
      ok: false,
      code: "BANK_ACCOUNT_NOT_FOUND",
      message: "not found",
    })
    expect(result.current.setDefaultState).toEqual({
      loading: false,
      accountKey: "erpnext-jm-1",
      error: { code: "BANK_ACCOUNT_NOT_FOUND", message: "not found" },
    })
    // The default did not move.
    expect(findAccount(result, "jm-2").isDefault).toBe(true)
  })

  it("turns a thrown (network) error into { ok: false } instead of rejecting", async () => {
    const { result, waitFor } = renderBankAccounts([
      ...baseMocks(),
      {
        request: {
          query: BankAccountSetDefaultDocument,
          variables: { input: { bankAccountId: "jm-1" } },
        },
        error: new Error("Network request failed"),
      },
    ])
    await waitFor(() => {
      expect(accountCount(result)).toBe(ALL_ACCOUNTS)
    })

    let outcome
    await act(async () => {
      outcome = await result.current.setDefault(findAccount(result, "jm-1"))
    })

    expect(outcome).toEqual({ ok: false, message: "Network request failed" })
    expect(result.current.setDefaultState.error?.message).toBe("Network request failed")
    expect(result.current.setDefaultState.loading).toBe(false)
  })

  it("still succeeds when the follow-up refetch fails (the change is applied)", async () => {
    const { result, waitFor } = renderBankAccounts([
      ...baseMocks(),
      {
        request: {
          query: BankAccountSetDefaultDocument,
          variables: { input: { bankAccountId: "jm-1" } },
        },
        result: {
          data: {
            bankAccountSetDefault: {
              __typename: "BankAccountPayload",
              errors: [],
              bankAccount: bank({
                id: "jm-1",
                accountNumber: "11110001",
                isDefault: true,
              }),
            },
          },
        },
      },
      { request: { query: BankAccountsDocument }, error: new Error("offline") },
    ])
    await waitFor(() => {
      expect(accountCount(result)).toBe(ALL_ACCOUNTS)
    })

    let outcome
    await act(async () => {
      outcome = await result.current.setDefault(findAccount(result, "jm-1"))
    })

    expect(outcome).toEqual({ ok: true })
    expect(result.current.setDefaultState.error).toBeUndefined()
  })

  it("refuses the receive (bridge-virtual) account without calling anything", async () => {
    const { result, waitFor } = renderBankAccounts(baseMocks())
    await waitFor(() => {
      expect(result.current.receiveAccount).not.toBeNull()
    })

    let outcome
    await act(async () => {
      outcome = await result.current.setDefault(
        result.current.receiveAccount as BankAccountVM,
      )
    })
    expect(outcome).toEqual({ ok: false })
  })
})

describe("useBankAccounts — remove", () => {
  it("erpnext: calls bankAccountDelete, then refetches BankAccounts", async () => {
    const mutation = jest.fn(() => ({
      data: {
        bankAccountDelete: {
          __typename: "SuccessPayload",
          errors: [],
          success: true,
        },
      },
    }))
    const { result, waitFor } = renderBankAccounts([
      ...baseMocks(),
      {
        request: {
          query: BankAccountDeleteDocument,
          variables: { input: { bankAccountId: "jm-2" } },
        },
        result: mutation,
      },
      // Server promoted jm-1 after the default was deleted.
      bankAccountsMock([
        bank({ id: "jm-1", accountNumber: "11110001", isDefault: true }),
      ]),
    ])
    await waitFor(() => {
      expect(accountCount(result)).toBe(ALL_ACCOUNTS)
    })

    let outcome
    await act(async () => {
      outcome = await result.current.remove(findAccount(result, "jm-2"))
    })

    expect(outcome).toEqual({ ok: true })
    expect(mutation).toHaveBeenCalledTimes(1)
    const jmd = result.current.withdrawGroups.find((g) => g.rail === "local")
    expect(jmd?.accounts.map((a) => [a.id, a.isDefault])).toEqual([["jm-1", true]])
    expect(result.current.removeState).toEqual({
      loading: false,
      accountKey: "erpnext-jm-2",
      error: undefined,
    })
  })

  it("erpnext: success=false without errors is a failure", async () => {
    const { result, waitFor } = renderBankAccounts([
      ...baseMocks(),
      {
        request: {
          query: BankAccountDeleteDocument,
          variables: { input: { bankAccountId: "jm-1" } },
        },
        result: {
          data: {
            bankAccountDelete: {
              __typename: "SuccessPayload",
              errors: [],
              success: false,
            },
          },
        },
      },
      bankAccountsMock(initialBanks),
    ])
    await waitFor(() => {
      expect(accountCount(result)).toBe(ALL_ACCOUNTS)
    })

    let outcome
    await act(async () => {
      outcome = await result.current.remove(findAccount(result, "jm-1"))
    })
    expect(outcome).toEqual({ ok: false })
  })

  it("bridge-external: calls bridgeDeleteExternalAccount, then refetches the list", async () => {
    const mutation = jest.fn(() => ({
      data: {
        bridgeDeleteExternalAccount: {
          __typename: "BridgeDeleteExternalAccountPayload",
          errors: [],
          externalAccount: null,
        },
      },
    }))
    const { result, waitFor } = renderBankAccounts([
      ...baseMocks(),
      {
        request: {
          query: BridgeDeleteExternalAccountDocument,
          variables: { input: { externalAccountId: "ext-1" } },
        },
        result: mutation,
      },
      externalAccountsMock([external("ext-2", true, "2222")]),
    ])
    await waitFor(() => {
      expect(accountCount(result)).toBe(ALL_ACCOUNTS)
    })

    let outcome
    await act(async () => {
      outcome = await result.current.remove(findAccount(result, "ext-1"))
    })

    expect(outcome).toEqual({ ok: true })
    expect(mutation).toHaveBeenCalledTimes(1)
    const us = result.current.withdrawGroups.find((g) => g.rail === "us")
    expect(us?.accounts.map((a) => a.id)).toEqual(["ext-2"])
  })

  it("bridge-external: returns the payload error and keeps the account", async () => {
    const { result, waitFor } = renderBankAccounts([
      ...baseMocks(),
      {
        request: {
          query: BridgeDeleteExternalAccountDocument,
          variables: { input: { externalAccountId: "ext-1" } },
        },
        result: {
          data: {
            bridgeDeleteExternalAccount: {
              __typename: "BridgeDeleteExternalAccountPayload",
              errors: [
                {
                  __typename: "GraphQLApplicationError",
                  code: "TOO_MANY_REQUEST",
                  message: "slow down",
                },
              ],
              externalAccount: null,
            },
          },
        },
      },
      externalAccountsMock(initialExternals),
    ])
    await waitFor(() => {
      expect(accountCount(result)).toBe(ALL_ACCOUNTS)
    })

    let outcome
    await act(async () => {
      outcome = await result.current.remove(findAccount(result, "ext-1"))
    })

    expect(outcome).toEqual({ ok: false, code: "TOO_MANY_REQUEST", message: "slow down" })
    expect(result.current.removeState.error).toEqual({
      code: "TOO_MANY_REQUEST",
      message: "slow down",
    })
    expect(findAccount(result, "ext-1")).toBeDefined()
  })
})
