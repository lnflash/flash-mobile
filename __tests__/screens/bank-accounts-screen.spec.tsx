/**
 * BankAccountsScreen — the Settings → Bank accounts hub.
 *
 * Contract under test:
 *  - "Add Jamaican bank account" is available with the Bridge flag on OR off;
 *    the Bridge sections (receive card, Plaid CTA) only render with it on.
 *  - Action sheet: Set as default (non-default only) / Edit details (erpnext
 *    only, Bridge has no edit API) / Remove (erpnext + bridge-external).
 *  - Remove asks for a destructive confirmation before calling the hook.
 *  - Success and mapped error toasts for set-default and remove.
 */

import * as React from "react"
import { Alert } from "react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { act, fireEvent, render } from "@testing-library/react-native"

import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { BankAccountVM } from "@app/screens/settings-screen/bank-accounts/types"

const mockNavigate = jest.fn()
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: jest.fn(),
}))
jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})
jest.mock("@app/components/screen", () => {
  const { View } = jest.requireActual("react-native")
  return { Screen: View }
})
jest.mock("@app/components/topup-cashout-flow", () => ({ BridgeKycModal: () => null }))
jest.mock("@app/hooks/use-account-status", () => ({
  useAccountStatus: () => ({ capabilities: { verified: true } }),
}))
jest.mock("@app/hooks/use-bridge-kyc", () => ({
  useBridgeKyc: () => ({
    kycModalVisible: false,
    startBridgeKyc: jest.fn(),
    closeKycModal: jest.fn(),
    submitBridgeKyc: jest.fn(),
  }),
}))
jest.mock("@app/hooks/use-plaid-link", () => ({
  usePlaidLink: () => ({ linkBankAccount: jest.fn() }),
}))
jest.mock("@app/store/redux", () => ({ useAppDispatch: () => jest.fn() }))
jest.mock("@app/store/redux/slices/accountUpgradeSlice", () => ({
  setAccountUpgrade: jest.fn(),
}))
jest.mock("@app/utils/external", () => ({ openWhatsAppUrl: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))

let mockBridgeTopupEnabled = true
jest.mock("@app/config/feature-flags-context", () => ({
  useFeatureFlags: () => ({ bridgeTopupEnabled: mockBridgeTopupEnabled }),
}))

const mockSetDefault = jest.fn()
const mockRemove = jest.fn()
let mockHookState: Record<string, unknown>
jest.mock("@app/screens/settings-screen/bank-accounts/use-bank-accounts", () => ({
  useBankAccounts: () => mockHookState,
}))

import { BankAccountsScreen } from "@app/screens/settings-screen/bank-accounts/bank-accounts-screen"
import { toastShow } from "@app/utils/toast"

loadLocale("en")
const en = i18nObject("en")
const mockToastShow = toastShow as jest.Mock

const account = (overrides: Partial<BankAccountVM>): BankAccountVM => ({
  key: "erpnext-jm-1",
  id: "jm-1",
  source: "erpnext",
  role: "withdraw",
  bankName: "NCB",
  last4: "0001",
  currency: "JMD",
  status: "verified",
  isDefault: false,
  canSetDefault: true,
  canRemove: true,
  accountNumber: "11110001",
  bankBranch: "Half Way Tree",
  accountType: "Savings",
  currencyRaw: "JMD",
  pendingUpdate: null,
  ...overrides,
})

const jmDefault = account({
  key: "erpnext-jm-2",
  id: "jm-2",
  last4: "0002",
  isDefault: true,
})
const jmOther = account({})
const bridgeOther = account({
  key: "bridge-ext-1",
  id: "ext-1",
  source: "bridge-external",
  bankName: "Chase",
  last4: "1111",
  currency: "USD",
})

const renderHub = () =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <BankAccountsScreen />
    </ThemeProvider>,
  )

type AlertButton = { text: string; style?: string; onPress?: () => void }
const lastAlertButtons = (alertSpy: jest.SpyInstance): AlertButton[] =>
  alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2]
const pressAlertButton = async (alertSpy: jest.SpyInstance, text: string) => {
  const button = lastAlertButtons(alertSpy).find((b) => b.text === text)
  if (!button?.onPress) throw new Error(`alert has no "${text}" button`)
  await act(async () => {
    await button.onPress?.()
  })
}

let alertSpy: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  mockBridgeTopupEnabled = true
  mockSetDefault.mockResolvedValue({ ok: true })
  mockRemove.mockResolvedValue({ ok: true })
  mockHookState = {
    loading: false,
    kycApproved: true,
    receiveAccount: null,
    withdrawGroups: [
      { currency: "USD", accounts: [bridgeOther] },
      { currency: "JMD", accounts: [jmDefault, jmOther] },
    ],
    setDefault: mockSetDefault,
    remove: mockRemove,
    setDefaultState: { loading: false },
    removeState: { loading: false },
    refetch: jest.fn(),
  }
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
})

afterEach(() => {
  alertSpy.mockRestore()
})

describe("BankAccountsScreen — add CTAs", () => {
  it("opens the add form from 'Add Jamaican bank account'", () => {
    const screen = renderHub()

    fireEvent.press(screen.getByTestId("add-jamaican-bank-account"))

    expect(mockNavigate).toHaveBeenCalledWith("EditBankAccount", { mode: "add" })
  })

  it("keeps the Jamaican CTA and hides the Bridge sections when the flag is off", () => {
    mockBridgeTopupEnabled = false
    mockHookState = {
      ...mockHookState,
      kycApproved: false,
      withdrawGroups: [{ currency: "JMD", accounts: [jmDefault] }],
    }
    const screen = renderHub()

    expect(screen.getByText(en.BankAccountsScreen.addJamaicanAccount())).toBeTruthy()
    expect(screen.queryByText(en.BankAccountsScreen.addBankAccount())).toBeNull()
    expect(screen.queryByText(en.BankAccountsScreen.receiveMoney())).toBeNull()
    expect(screen.queryByText(en.BankAccountsScreen.verifyIdentityTitle())).toBeNull()
  })

  it("shows both CTAs and the receive section when the flag is on", () => {
    const screen = renderHub()

    expect(screen.getByText(en.BankAccountsScreen.addJamaicanAccount())).toBeTruthy()
    expect(screen.getByText(en.BankAccountsScreen.addBankAccount())).toBeTruthy()
    expect(screen.getByText(en.BankAccountsScreen.receiveMoney())).toBeTruthy()
  })
})

describe("BankAccountsScreen — action sheet", () => {
  const openActions = (screen: ReturnType<typeof renderHub>, key: string) =>
    fireEvent.press(screen.getByTestId(`bank-account-actions-${key}`))

  it("erpnext non-default: Set as default, Edit details, Remove, Cancel", () => {
    const screen = renderHub()
    openActions(screen, jmOther.key)

    expect(lastAlertButtons(alertSpy).map((b) => b.text)).toEqual([
      en.BankAccountsScreen.setAsDefault(),
      en.BankAccountsScreen.updateDetails(),
      en.BankAccountsScreen.remove(),
      en.common.cancel(),
    ])
  })

  it("the default account has no 'Set as default'", () => {
    const screen = renderHub()
    openActions(screen, jmDefault.key)

    expect(lastAlertButtons(alertSpy).map((b) => b.text)).toEqual([
      en.BankAccountsScreen.updateDetails(),
      en.BankAccountsScreen.remove(),
      en.common.cancel(),
    ])
  })

  it("bridge-external: no Edit (no edit API), Remove available, no 'coming soon'", () => {
    const screen = renderHub()
    openActions(screen, bridgeOther.key)

    const texts = lastAlertButtons(alertSpy).map((b) => b.text)
    expect(texts).toEqual([
      en.BankAccountsScreen.setAsDefault(),
      en.BankAccountsScreen.remove(),
      en.common.cancel(),
    ])
    expect(texts.join(" ")).not.toMatch(/coming soon/i)
  })

  it("Edit details opens the form prefilled in edit mode", async () => {
    const screen = renderHub()
    openActions(screen, jmOther.key)
    await pressAlertButton(alertSpy, en.BankAccountsScreen.updateDetails())

    expect(mockNavigate).toHaveBeenCalledWith("EditBankAccount", {
      mode: "edit",
      accountId: "jm-1",
      bankName: "NCB",
      bankBranch: "Half Way Tree",
      accountType: "Savings",
      accountNumber: "11110001",
      currency: "JMD",
    })
  })

  it("Set as default calls the hook and toasts success", async () => {
    const screen = renderHub()
    openActions(screen, bridgeOther.key)
    await pressAlertButton(alertSpy, en.BankAccountsScreen.setAsDefault())

    expect(mockSetDefault).toHaveBeenCalledWith(bridgeOther)
    expect(mockToastShow).toHaveBeenCalledWith({
      type: "success",
      message: en.BankAccountsScreen.defaultUpdated(),
    })
  })

  it("Set as default failure toasts the mapped error", async () => {
    mockSetDefault.mockResolvedValue({ ok: false, code: "BANK_ACCOUNT_NOT_FOUND" })
    const screen = renderHub()
    openActions(screen, jmOther.key)
    await pressAlertButton(alertSpy, en.BankAccountsScreen.setAsDefault())

    expect(mockToastShow).toHaveBeenCalledWith({
      type: "error",
      message: en.BankAccountsScreen.errorNotFound(),
    })
  })

  it("Remove asks for a destructive confirmation before calling the hook", async () => {
    const screen = renderHub()
    openActions(screen, jmOther.key)
    await pressAlertButton(alertSpy, en.BankAccountsScreen.remove())

    expect(mockRemove).not.toHaveBeenCalled()
    const [title, message] = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]
    expect(title).toBe(en.BankAccountsScreen.removeConfirmTitle())
    expect(message).toBe(
      en.BankAccountsScreen.removeConfirmMessage({ bankName: "NCB", last4: "0001" }),
    )
    const confirm = lastAlertButtons(alertSpy).find(
      (b) => b.text === en.BankAccountsScreen.remove(),
    )
    expect(confirm?.style).toBe("destructive")

    await pressAlertButton(alertSpy, en.BankAccountsScreen.remove())

    expect(mockRemove).toHaveBeenCalledWith(jmOther)
    expect(mockToastShow).toHaveBeenCalledWith({
      type: "success",
      message: en.BankAccountsScreen.accountRemoved(),
    })
  })

  it("cancelling the confirmation removes nothing", async () => {
    const screen = renderHub()
    openActions(screen, bridgeOther.key)
    await pressAlertButton(alertSpy, en.BankAccountsScreen.remove())

    const cancel = lastAlertButtons(alertSpy).find((b) => b.text === en.common.cancel())
    expect(cancel?.style).toBe("cancel")
    expect(cancel?.onPress).toBeUndefined()
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it("Remove failure toasts the server message for an unknown code", async () => {
    mockRemove.mockResolvedValue({
      ok: false,
      code: "WHATEVER",
      message: "Bridge said no",
    })
    const screen = renderHub()
    openActions(screen, bridgeOther.key)
    await pressAlertButton(alertSpy, en.BankAccountsScreen.remove())
    await pressAlertButton(alertSpy, en.BankAccountsScreen.remove())

    expect(mockToastShow).toHaveBeenCalledWith({
      type: "error",
      message: "Bridge said no",
    })
  })

  it("replaces the actions button with a spinner while an action runs on that row", () => {
    mockHookState = {
      ...mockHookState,
      removeState: { loading: true, accountKey: jmOther.key },
    }
    const screen = renderHub()

    expect(screen.queryByTestId(`bank-account-actions-${jmOther.key}`)).toBeNull()
    expect(screen.getByTestId(`bank-account-actions-${jmDefault.key}`)).toBeTruthy()
  })
})
