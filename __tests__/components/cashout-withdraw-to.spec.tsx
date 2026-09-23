/**
 * CashoutWithdrawTo — the cash-out "Withdraw to" card.
 *
 * Contract under test:
 *  - It loads accounts itself (cache-first → network on a cold cache; the old
 *    cache-only policy rendered nothing until another screen filled the cache).
 *  - With no selection it shows the SERVER default, via the same
 *    pickDefaultBankAccount the cash-out screen sends with.
 *  - Picker mode: tapping the card asks the SCREEN to open the account sheet.
 *    The card renders no modal of its own — an inline (coverScreen={false})
 *    sheet inside this small card would be clipped to it; the sheet is covered
 *    by cashout-account-picker.spec.tsx.
 *  - Display mode (confirmation): tapping expands the details of the account
 *    the offer was requested for.
 *  - Bridge source shows the Bridge external default from `isDefault`.
 */

import * as React from "react"
import { MockedProvider } from "@apollo/client/testing"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { fireEvent, render } from "@testing-library/react-native"

import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})
const mockModal = jest.fn(() => null)
jest.mock("react-native-modal", () => mockModal)

import CashoutWithdrawTo from "@app/components/topup-cashout-flow/CashoutWithdrawTo"

import { bankAccountsMock, externalAccountsMock } from "./cashout-accounts.fixtures"

loadLocale("en")
const en = i18nObject("en")

const renderCard = (props: React.ComponentProps<typeof CashoutWithdrawTo>) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <MockedProvider mocks={[bankAccountsMock, externalAccountsMock]}>
        <CashoutWithdrawTo {...props} />
      </MockedProvider>
    </ThemeProvider>,
  )

beforeEach(() => {
  jest.clearAllMocks()
})

describe("CashoutWithdrawTo — picker trigger (cash-out details)", () => {
  it("loads from the network on a cold cache and shows the server default", async () => {
    const screen = renderCard({ onOpenPicker: jest.fn() })

    expect(await screen.findByText("**********2222")).toBeTruthy()
    expect(screen.getByText("Bank jm-2 · JMD")).toBeTruthy()
  })

  it("tapping the card asks the screen to open the picker; no details, no modal here", async () => {
    const onOpenPicker = jest.fn()
    const screen = renderCard({ onOpenPicker })
    await screen.findByText("**********2222")

    fireEvent.press(screen.getByTestId("cashout-withdraw-to"))

    expect(onOpenPicker).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("Half Way Tree")).toBeNull()
    // The sheet must live at the screen root, never inside this card.
    expect(mockModal).not.toHaveBeenCalled()
  })

  it("shows the selected account over the server default", async () => {
    const screen = renderCard({ onOpenPicker: jest.fn(), selectedAccountId: "us-1" })

    expect(await screen.findByText("**********3333")).toBeTruthy()
    expect(screen.getByText("Bank us-1 · USD")).toBeTruthy()
  })

  it("bridge source: shows the external default, then the selection", async () => {
    const screen = renderCard({ source: "bridge", onOpenPicker: jest.fn() })
    expect(await screen.findByText("Wells Fargo ••5555")).toBeTruthy()

    screen.rerender(
      <ThemeProvider theme={createTheme({})}>
        <MockedProvider mocks={[bankAccountsMock, externalAccountsMock]}>
          <CashoutWithdrawTo
            source="bridge"
            onOpenPicker={jest.fn()}
            selectedAccountId="ext-1"
          />
        </MockedProvider>
      </ThemeProvider>,
    )
    expect(await screen.findByText("Chase ••4444")).toBeTruthy()
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
