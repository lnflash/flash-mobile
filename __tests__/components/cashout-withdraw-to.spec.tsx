/**
 * CashoutWithdrawTo — the cash-out "Withdraw to" card.
 *
 * Contract under test:
 *  - It loads accounts itself (cache-first → network on a cold cache; the old
 *    cache-only policy rendered nothing until another screen filled the cache).
 *  - With no selection it shows the SERVER default, via the same
 *    pickDefaultBankAccount the cash-out screen sends with.
 *  - Picker mode: tapping the card lists every eligible account plus a manage
 *    link; choosing one reports its id and closes the sheet.
 *  - Display mode (confirmation): no picker; tapping expands the details of the
 *    account the offer was requested for.
 *  - Bridge source lists Bridge external accounts, default from `isDefault`.
 */

import * as React from "react"
import { MockedProvider, MockedResponse } from "@apollo/client/testing"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { fireEvent, render } from "@testing-library/react-native"

import {
  BankAccountsDocument,
  BridgeExternalAccountsDocument,
} from "@app/graphql/generated"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})
// react-native-modal animates its content in; render children synchronously.
jest.mock("react-native-modal", () => {
  const ReactActual = jest.requireActual("react")
  const { View } = jest.requireActual("react-native")
  return ({ isVisible, children }: { isVisible: boolean; children: React.ReactNode }) =>
    isVisible ? ReactActual.createElement(View, null, children) : null
})

import CashoutWithdrawTo from "@app/components/topup-cashout-flow/CashoutWithdrawTo"

loadLocale("en")
const en = i18nObject("en")

const bank = (id: string, last4: string, currency: "JMD" | "USD") => ({
  __typename: "BankAccount",
  accountName: null,
  accountNumber: `0000${last4}`,
  accountType: "Savings",
  bankBranch: "Half Way Tree",
  bankName: `Bank ${id}`,
  currency,
  id,
  isDefault: false,
  pendingUpdate: null,
})

const bankAccountsMock: MockedResponse = {
  request: { query: BankAccountsDocument },
  result: {
    data: {
      me: {
        __typename: "User",
        id: "user-1",
        bankAccounts: [
          bank("jm-1", "1111", "JMD"),
          { ...bank("jm-2", "2222", "JMD"), isDefault: true },
          bank("us-1", "3333", "USD"),
        ],
      },
    },
  },
}

const externalAccountsMock: MockedResponse = {
  request: { query: BridgeExternalAccountsDocument },
  result: {
    data: {
      bridgeExternalAccounts: [
        {
          __typename: "BridgeExternalAccount",
          accountNumberLast4: "4444",
          bankName: "Chase",
          id: "ext-1",
          isDefault: false,
          status: "active",
        },
        {
          __typename: "BridgeExternalAccount",
          accountNumberLast4: "5555",
          bankName: "Wells Fargo",
          id: "ext-2",
          isDefault: true,
          status: "active",
        },
      ],
    },
  },
}

const renderCard = (props: React.ComponentProps<typeof CashoutWithdrawTo>) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <MockedProvider mocks={[bankAccountsMock, externalAccountsMock]}>
        <CashoutWithdrawTo {...props} />
      </MockedProvider>
    </ThemeProvider>,
  )

describe("CashoutWithdrawTo — picker (cash-out details)", () => {
  it("loads from the network on a cold cache and shows the server default", async () => {
    const screen = renderCard({ onSelectAccount: jest.fn() })

    expect(await screen.findByText("**********2222")).toBeTruthy()
    expect(screen.getByText("Bank jm-2 · JMD")).toBeTruthy()
  })

  it("lists every account with the default badge and a manage link", async () => {
    const screen = renderCard({ onSelectAccount: jest.fn(), onManageAccounts: jest.fn() })
    await screen.findByText("**********2222")
    expect(screen.queryByText(en.Cashout.chooseAccount())).toBeNull()

    fireEvent.press(screen.getByTestId("cashout-withdraw-to"))

    expect(screen.getByText(en.Cashout.chooseAccount())).toBeTruthy()
    expect(screen.getByText("••••1111 · JMD")).toBeTruthy()
    expect(screen.getByText("••••2222 · JMD")).toBeTruthy()
    expect(screen.getByText("••••3333 · USD")).toBeTruthy()
    expect(screen.getAllByText(en.Cashout.defaultAccount())).toHaveLength(1)
    expect(screen.getByText(en.Cashout.manageBankAccounts())).toBeTruthy()
    // The current pick is the one marked selected.
    expect(screen.getByTestId("cashout-account-jm-2").props.accessibilityState).toEqual({
      selected: true,
    })
    expect(screen.getByTestId("cashout-account-us-1").props.accessibilityState).toEqual({
      selected: false,
    })
  })

  it("reports the chosen account id and closes the sheet", async () => {
    const onSelectAccount = jest.fn()
    const screen = renderCard({ onSelectAccount })
    await screen.findByText("**********2222")

    fireEvent.press(screen.getByTestId("cashout-withdraw-to"))
    fireEvent.press(screen.getByTestId("cashout-account-us-1"))

    expect(onSelectAccount).toHaveBeenCalledWith("us-1")
    expect(screen.queryByText(en.Cashout.chooseAccount())).toBeNull()
  })

  it("shows the selected account over the server default", async () => {
    const screen = renderCard({ onSelectAccount: jest.fn(), selectedAccountId: "us-1" })

    expect(await screen.findByText("**********3333")).toBeTruthy()
    expect(screen.getByText("Bank us-1 · USD")).toBeTruthy()
  })

  it("opens Manage bank accounts from the sheet and closes it", async () => {
    const onManageAccounts = jest.fn()
    const screen = renderCard({ onSelectAccount: jest.fn(), onManageAccounts })
    await screen.findByText("**********2222")

    fireEvent.press(screen.getByTestId("cashout-withdraw-to"))
    fireEvent.press(screen.getByTestId("cashout-manage-bank-accounts"))

    expect(onManageAccounts).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(en.Cashout.chooseAccount())).toBeNull()
  })

  it("bridge source: lists external accounts, default from isDefault", async () => {
    const onSelectAccount = jest.fn()
    const screen = renderCard({ source: "bridge", onSelectAccount })

    expect(await screen.findByText("Wells Fargo ••5555")).toBeTruthy()

    fireEvent.press(screen.getByTestId("cashout-withdraw-to"))
    expect(screen.getByText("••••4444 · USD")).toBeTruthy()
    fireEvent.press(screen.getByTestId("cashout-account-ext-1"))

    expect(onSelectAccount).toHaveBeenCalledWith("ext-1")
  })
})

describe("CashoutWithdrawTo — display only (confirmation)", () => {
  it("shows the account the offer was requested for and expands its details", async () => {
    const screen = renderCard({ selectedAccountId: "jm-1", preferredCurrency: "JMD" })
    expect(await screen.findByText("**********1111")).toBeTruthy()

    fireEvent.press(screen.getByTestId("cashout-withdraw-to"))

    // Details, not a picker.
    expect(screen.queryByText(en.Cashout.chooseAccount())).toBeNull()
    expect(screen.getByText("Bank jm-1")).toBeTruthy()
    expect(screen.getByText("Half Way Tree")).toBeTruthy()
    expect(screen.getByText("00001111")).toBeTruthy()
  })

  it("keeps to the offer's payout currency when no account id came through", async () => {
    const screen = renderCard({ preferredCurrency: "JMD" })

    expect(await screen.findByText("**********2222")).toBeTruthy()
  })
})
