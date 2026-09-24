/**
 * CashoutAccountPicker — the cash-out "Choose an account" bottom sheet.
 *
 * Contract under test:
 *  - Fabric/Android freeze class (#545): the bottom-anchored sheet MUST render
 *    inline (coverScreen={false}); through RCTModalHostView it lands below the
 *    viewport while its backdrop eats every touch, mid-cashout.
 *  - Lists every eligible account with the default badge, marks the current
 *    pick, reports the chosen id and closes.
 *  - The list scrolls (bounded height) so any number of accounts stays
 *    reachable; the manage link sits outside the scroller, always visible.
 *  - "Manage bank accounts" navigates from onModalHide — after the sheet has
 *    hidden — never in the same tick as the close.
 *  - Bridge source lists Bridge external accounts, default from `isDefault`.
 */

import * as React from "react"
import { MockedProvider } from "@apollo/client/testing"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { act, fireEvent, render } from "@testing-library/react-native"
import { ReactTestInstance } from "react-test-renderer"

import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"

// The sheet pads by the safe-area inset (ENG-605); no provider in this tree.
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

// react-native-modal animates; this stand-in renders children synchronously,
// records its props, and lets a test finish the hide animation on demand
// (the real modal fires onModalHide only once the sheet is off screen).
type ModalProps = {
  isVisible: boolean
  coverScreen?: boolean
  onModalHide?: () => void
  children: React.ReactNode
}
let mockLastModalProps: ModalProps | undefined
jest.mock("react-native-modal", () => {
  const ReactActual = jest.requireActual("react")
  const { View } = jest.requireActual("react-native")
  return (props: ModalProps) => {
    mockLastModalProps = props
    return props.isVisible ? ReactActual.createElement(View, null, props.children) : null
  }
})

import CashoutAccountPicker from "@app/components/topup-cashout-flow/CashoutAccountPicker"

import { bankAccountsMock, externalAccountsMock } from "./cashout-accounts.fixtures"

loadLocale("en")
const en = i18nObject("en")

type PickerProps = React.ComponentProps<typeof CashoutAccountPicker>

// Owns `visible` the way CashoutDetails does, so closing really hides the sheet.
const Host = (
  props: Omit<PickerProps, "visible" | "onClose"> & { onClose: jest.Mock },
) => {
  const [visible, setVisible] = React.useState(true)
  return (
    <CashoutAccountPicker
      {...props}
      visible={visible}
      onClose={() => {
        props.onClose()
        setVisible(false)
      }}
    />
  )
}

const renderPicker = (props: Partial<PickerProps> = {}) => {
  const onClose = jest.fn()
  const onSelectAccount = jest.fn()
  const screen = render(
    <ThemeProvider theme={createTheme({})}>
      <MockedProvider mocks={[bankAccountsMock, externalAccountsMock]}>
        <Host onSelectAccount={onSelectAccount} {...props} onClose={onClose} />
      </MockedProvider>
    </ThemeProvider>,
  )
  return { screen, onClose, onSelectAccount }
}

const finishHideAnimation = () =>
  act(() => {
    mockLastModalProps?.onModalHide?.()
  })

const isInside = (node: ReactTestInstance, ancestor: ReactTestInstance) => {
  for (let at: ReactTestInstance | null = node; at; at = at.parent) {
    if (at === ancestor) return true
  }
  return false
}

beforeEach(() => {
  jest.clearAllMocks()
  mockLastModalProps = undefined
})

describe("CashoutAccountPicker", () => {
  it("renders inline: coverScreen={false} (Fabric/Android bottom-sheet freeze)", async () => {
    const { screen } = renderPicker()
    await screen.findByTestId("cashout-account-jm-1")

    expect(mockLastModalProps?.coverScreen).toBe(false)
  })

  it("lists every account with the default badge and marks the current pick", async () => {
    const { screen } = renderPicker({ onManageAccounts: jest.fn() })
    await screen.findByTestId("cashout-account-jm-1")

    expect(screen.getByText(en.Cashout.chooseAccount())).toBeTruthy()
    expect(screen.getByText("••••1111 · JMD")).toBeTruthy()
    expect(screen.getByText("••••2222 · JMD")).toBeTruthy()
    expect(screen.getByText("••••3333 · USD")).toBeTruthy()
    expect(screen.getAllByText(en.Cashout.defaultAccount())).toHaveLength(1)
    expect(screen.getByText(en.Cashout.manageBankAccounts())).toBeTruthy()
    // With no selection the server default is the current pick.
    expect(screen.getByTestId("cashout-account-jm-2").props.accessibilityState).toEqual({
      selected: true,
    })
    expect(screen.getByTestId("cashout-account-us-1").props.accessibilityState).toEqual({
      selected: false,
    })
  })

  it("marks the selected account over the server default", async () => {
    const { screen } = renderPicker({ selectedAccountId: "us-1" })
    await screen.findByTestId("cashout-account-us-1")

    expect(screen.getByTestId("cashout-account-us-1").props.accessibilityState).toEqual({
      selected: true,
    })
    expect(screen.getByTestId("cashout-account-jm-2").props.accessibilityState).toEqual({
      selected: false,
    })
  })

  it("reports the chosen account id and closes the sheet", async () => {
    const { screen, onSelectAccount, onClose } = renderPicker()
    fireEvent.press(await screen.findByTestId("cashout-account-us-1"))

    expect(onSelectAccount).toHaveBeenCalledWith("us-1")
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(en.Cashout.chooseAccount())).toBeNull()
  })

  it("keeps the options in a height-bounded scroller and the manage link outside it", async () => {
    const { screen } = renderPicker({ onManageAccounts: jest.fn() })
    await screen.findByTestId("cashout-account-jm-1")

    const list = screen.getByTestId("cashout-account-list")
    const { maxHeight } = list.props.style
    expect(maxHeight).toBeGreaterThan(0)
    // jest's window is 1334 tall: the list may take a share of it, never all.
    expect(maxHeight).toBeLessThan(1334)

    for (const id of ["jm-1", "jm-2", "us-1"]) {
      expect(isInside(screen.getByTestId(`cashout-account-${id}`), list)).toBe(true)
    }
    expect(isInside(screen.getByTestId("cashout-manage-bank-accounts"), list)).toBe(false)
    expect(isInside(screen.getByText(en.Cashout.chooseAccount()), list)).toBe(false)
  })

  it("Manage bank accounts closes first and navigates only once the sheet has hidden", async () => {
    const onManageAccounts = jest.fn()
    const { screen, onClose } = renderPicker({ onManageAccounts })
    fireEvent.press(await screen.findByTestId("cashout-manage-bank-accounts"))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(en.Cashout.chooseAccount())).toBeNull()
    // Not in the same tick as the close.
    expect(onManageAccounts).not.toHaveBeenCalled()

    finishHideAnimation()
    expect(onManageAccounts).toHaveBeenCalledTimes(1)

    // A later hide (any other dismissal) must not navigate again.
    finishHideAnimation()
    expect(onManageAccounts).toHaveBeenCalledTimes(1)
  })

  it("picking an account never triggers the manage navigation on hide", async () => {
    const onManageAccounts = jest.fn()
    const { screen } = renderPicker({ onManageAccounts })
    fireEvent.press(await screen.findByTestId("cashout-account-jm-1"))

    finishHideAnimation()

    expect(onManageAccounts).not.toHaveBeenCalled()
  })

  it("bridge source: lists external accounts, default from isDefault", async () => {
    const { screen, onSelectAccount } = renderPicker({ source: "bridge" })

    expect(await screen.findByText("••••4444 · USD")).toBeTruthy()
    expect(screen.getByTestId("cashout-account-ext-2").props.accessibilityState).toEqual({
      selected: true,
    })
    expect(screen.queryByTestId("cashout-account-jm-1")).toBeNull()

    fireEvent.press(screen.getByTestId("cashout-account-ext-1"))
    expect(onSelectAccount).toHaveBeenCalledWith("ext-1")
  })
})
