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
import { StyleSheet } from "react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { ReactTestInstance } from "react-test-renderer"

import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"

// The sheet pads by the safe-area inset (ENG-605). The provider mock feeds
// `useSafeAreaInsets` from context so a test can render under a 3-button-nav
// inset and pin that the sheet actually applies it on top of its own padding.
jest.mock("react-native-safe-area-context", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ReactActual = require("react")
  const actual = jest.requireActual("react-native-safe-area-context")
  const ZERO = { top: 0, bottom: 0, left: 0, right: 0 }
  return {
    ...actual,
    useSafeAreaInsets: () => ReactActual.useContext(actual.SafeAreaInsetsContext) ?? ZERO,
    SafeAreaProvider: ({
      children,
      initialMetrics,
    }: {
      children: React.ReactNode
      initialMetrics?: { insets: typeof ZERO }
    }) =>
      ReactActual.createElement(
        actual.SafeAreaInsetsContext.Provider,
        { value: initialMetrics?.insets ?? ZERO },
        children,
      ),
  }
})

// Android 15 3-button nav under edge-to-edge.
const THREE_BUTTON_NAV = { top: 24, bottom: 48, left: 0, right: 0 }
// The sheet's designed bottom padding (styles.sheet in the component).
const SHEET_DESIGN_PADDING_BOTTOM = 32

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

const renderPicker = (
  props: Partial<PickerProps> = {},
  insets: { top: number; bottom: number; left: number; right: number } = {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
) => {
  const onClose = jest.fn()
  const onSelectAccount = jest.fn()
  const screen = render(
    <SafeAreaProvider
      initialMetrics={{ insets, frame: { x: 0, y: 0, width: 0, height: 0 } }}
    >
      <ThemeProvider theme={createTheme({})}>
        <MockedProvider mocks={[bankAccountsMock, externalAccountsMock]}>
          <Host onSelectAccount={onSelectAccount} {...props} onClose={onClose} />
        </MockedProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  )
  return { screen, onClose, onSelectAccount }
}

const sheetPaddingBottom = (screen: ReturnType<typeof render>) =>
  StyleSheet.flatten(screen.getByTestId("cashout-account-sheet").props.style)
    .paddingBottom

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

  it("pads the sheet by its own bottom padding plus the safe-area inset (ENG-605)", async () => {
    // Inline (coverScreen={false}) means the sheet reaches the physical window
    // edge, so it must clear the nav bar itself -- on top of, not instead of,
    // the padding it was designed with.
    const { screen } = renderPicker({}, THREE_BUTTON_NAV)
    await screen.findByTestId("cashout-account-jm-1")

    expect(sheetPaddingBottom(screen)).toBe(
      SHEET_DESIGN_PADDING_BOTTOM + THREE_BUTTON_NAV.bottom,
    )
  })

  it("keeps its designed bottom padding when the window is not edge-to-edge", async () => {
    // Android 14 and older at target 35: inset 0, layout unchanged.
    const { screen } = renderPicker()
    await screen.findByTestId("cashout-account-jm-1")

    expect(sheetPaddingBottom(screen)).toBe(SHEET_DESIGN_PADDING_BOTTOM)
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
