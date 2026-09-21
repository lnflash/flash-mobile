/**
 * EditBankAccountScreen — add / edit a Jamaican bank account (instant).
 *
 * Contract under test:
 *  - Validation blocks the mutation: bank must come from SupportedBanks, branch
 *    and a digits-only account number are required, type is Chequing/Savings.
 *  - Add sends bankAccountAdd with currency fixed to JMD and the "set as
 *    default" choice; edit confirms first, then sends bankAccountUpdate with
 *    the account id and NO currency (locked server-side).
 *  - Both refetch BankAccounts (best effort), toast, and go back on success.
 *  - Error codes map to our copy; BANK_ACCOUNT_UPGRADE_REQUIRED offers the
 *    account upgrade flow instead of a dead-end alert.
 */

import * as React from "react"
import { Alert } from "react-native"
import { MockedProvider, MockedResponse } from "@apollo/client/testing"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import {
  BankAccountAddDocument,
  BankAccountUpdateDocument,
  BankAccountsDocument,
  SupportedBanksDocument,
} from "@app/graphql/generated"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))
jest.mock("@app/components/screen", () => {
  const { View } = jest.requireActual("react-native")
  return { Screen: View }
})
// The native dropdown renders nothing pressable under jest: list every option
// as a button so a test can pick one the way a user would.
jest.mock("react-native-element-dropdown", () => {
  const ReactActual = jest.requireActual("react")
  const { Pressable, Text } = jest.requireActual("react-native")
  type Item = { label: string; value: string }
  return {
    Dropdown: ({
      data,
      value,
      onChange,
    }: {
      data: Item[]
      value: string
      onChange: (item: Item) => void
    }) =>
      ReactActual.createElement(
        ReactActual.Fragment,
        null,
        ReactActual.createElement(Text, null, `selected:${value}`),
        ...data.map((item) =>
          ReactActual.createElement(
            Pressable,
            { key: item.value, onPress: () => onChange(item) },
            ReactActual.createElement(Text, null, `option:${item.label}`),
          ),
        ),
      ),
  }
})

import { EditBankAccountScreen } from "@app/screens/settings-screen/bank-accounts/edit-bank-account-screen"
import { toastShow } from "@app/utils/toast"

loadLocale("en")
const en = i18nObject("en")
const mockToastShow = toastShow as jest.Mock

const navigation = { goBack: jest.fn(), navigate: jest.fn() }

const supportedBanksMock: MockedResponse = {
  request: { query: SupportedBanksDocument },
  result: {
    data: {
      supportedBanks: [
        { __typename: "Bank", name: "NCB" },
        { __typename: "Bank", name: "Scotiabank" },
      ],
    },
  },
}

const storedAccount = {
  __typename: "BankAccount",
  accountName: null,
  accountNumber: "12345678",
  accountType: "Savings",
  bankBranch: "Half Way Tree",
  bankName: "NCB",
  currency: "JMD",
  id: "acc-1",
  isDefault: true,
}

// The awaited refetch after a successful mutation.
const refetchMock = (): MockedResponse & { result: jest.Mock } => ({
  request: { query: BankAccountsDocument },
  result: jest.fn(() => ({
    data: {
      me: {
        __typename: "User",
        id: "user-1",
        bankAccounts: [{ ...storedAccount, pendingUpdate: null }],
      },
    },
  })),
})

const appError = (code: string, message = "server message") => ({
  __typename: "GraphQLApplicationError",
  code,
  message,
})

const addInput = {
  bankName: "NCB",
  bankBranch: "Half Way Tree",
  accountType: "Savings",
  accountNumber: "12345678",
  currency: "JMD",
  setDefault: false,
}

const editParams = {
  mode: "edit" as const,
  accountId: "acc-1",
  bankName: "NCB",
  bankBranch: "Half Way Tree",
  accountType: "Savings",
  accountNumber: "12345678",
  currency: "JMD",
}

type Params = { mode: "add" } | typeof editParams

const renderScreen = (params: Params, mocks: MockedResponse[]) => {
  const props = {
    navigation,
    route: { key: "EditBankAccount", name: "EditBankAccount", params },
  } as unknown as React.ComponentProps<typeof EditBankAccountScreen>
  return render(
    <ThemeProvider theme={createTheme({})}>
      <MockedProvider mocks={[supportedBanksMock, ...mocks]}>
        <EditBankAccountScreen {...props} />
      </MockedProvider>
    </ThemeProvider>,
  )
}

type Screen = ReturnType<typeof renderScreen>

const fillAddForm = async (screen: Screen) => {
  // Bank options arrive with the SupportedBanks query.
  fireEvent.press(await screen.findByText("option:NCB"))
  fireEvent.changeText(
    screen.getByPlaceholderText(en.AccountUpgrade.bankBranchPlaceholder()),
    "Half Way Tree",
  )
  fireEvent.press(screen.getByText(`option:${en.BankAccountsScreen.savings()}`))
  fireEvent.changeText(
    screen.getByPlaceholderText(en.AccountUpgrade.accountNumPlaceholder()),
    "12345678",
  )
}

// Press a button of the most recent Alert.alert call.
const pressAlertButton = async (alertSpy: jest.SpyInstance, text: string) => {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as {
    text: string
    onPress?: () => void
  }[]
  const button = buttons.find((b) => b.text === text)
  if (!button?.onPress) throw new Error(`alert has no "${text}" button`)
  await act(async () => {
    button.onPress?.()
  })
}

let alertSpy: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
})

afterEach(() => {
  alertSpy.mockRestore()
})

describe("EditBankAccountScreen — add", () => {
  it("shows JMD locked, the add copy and the set-as-default switch", async () => {
    const screen = renderScreen({ mode: "add" }, [])
    await screen.findByText("option:NCB")

    expect(screen.getByText(en.BankAccountsScreen.addSubtitle())).toBeTruthy()
    expect(screen.getByText(en.BankAccountsScreen.currencyFixedOnAdd())).toBeTruthy()
    const currency = screen.getByDisplayValue("JMD")
    expect(currency.props.editable).toBe(false)
    expect(screen.getByTestId("bank-account-set-default").props.value).toBe(false)
  })

  it("blocks submit and shows every validation error on an empty form", async () => {
    const add = jest.fn()
    const screen = renderScreen({ mode: "add" }, [
      {
        request: { query: BankAccountAddDocument },
        result: add,
      },
    ])
    await screen.findByText("option:NCB")

    fireEvent.press(screen.getByText(en.BankAccountsScreen.addAccount()))

    expect(screen.getByText(en.BankAccountsScreen.bankRequired())).toBeTruthy()
    expect(screen.getByText(en.BankAccountsScreen.branchRequired())).toBeTruthy()
    expect(screen.getByText(en.BankAccountsScreen.accountTypeRequired())).toBeTruthy()
    expect(screen.getByText(en.BankAccountsScreen.accountNumberRequired())).toBeTruthy()
    expect(add).not.toHaveBeenCalled()
    expect(navigation.goBack).not.toHaveBeenCalled()
  })

  it("rejects an account number that is not digits, then clears the error on edit", async () => {
    const screen = renderScreen({ mode: "add" }, [])
    await fillAddForm(screen)
    const accountNumber = screen.getByPlaceholderText(
      en.AccountUpgrade.accountNumPlaceholder(),
    )

    fireEvent.changeText(accountNumber, "12ab5678")
    fireEvent.press(screen.getByText(en.BankAccountsScreen.addAccount()))
    expect(screen.getByText(en.BankAccountsScreen.accountNumberRequired())).toBeTruthy()

    fireEvent.changeText(accountNumber, "123")
    expect(screen.queryByText(en.BankAccountsScreen.accountNumberRequired())).toBeNull()
    fireEvent.press(screen.getByText(en.BankAccountsScreen.addAccount()))
    expect(screen.getByText(en.BankAccountsScreen.accountNumberRequired())).toBeTruthy()
  })

  it("adds the account (JMD, not default), refetches, toasts and goes back", async () => {
    const add = jest.fn(() => ({
      data: {
        bankAccountAdd: {
          __typename: "BankAccountPayload",
          errors: [],
          bankAccount: storedAccount,
        },
      },
    }))
    const refetch = refetchMock()
    const screen = renderScreen({ mode: "add" }, [
      {
        request: { query: BankAccountAddDocument, variables: { input: addInput } },
        result: add,
      },
      refetch,
    ])
    await fillAddForm(screen)

    fireEvent.press(screen.getByText(en.BankAccountsScreen.addAccount()))

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalledTimes(1))
    expect(add).toHaveBeenCalledTimes(1)
    expect(refetch.result).toHaveBeenCalledTimes(1)
    expect(mockToastShow).toHaveBeenCalledWith({
      type: "success",
      message: en.BankAccountsScreen.accountAdded(),
    })
    // Add is not confirm-gated.
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it("treats the add as saved even when the follow-up refetch fails", async () => {
    const screen = renderScreen({ mode: "add" }, [
      {
        request: { query: BankAccountAddDocument, variables: { input: addInput } },
        result: {
          data: {
            bankAccountAdd: {
              __typename: "BankAccountPayload",
              errors: [],
              bankAccount: storedAccount,
            },
          },
        },
      },
      { request: { query: BankAccountsDocument }, error: new Error("offline") },
    ])
    await fillAddForm(screen)

    fireEvent.press(screen.getByText(en.BankAccountsScreen.addAccount()))

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalledTimes(1))
    expect(alertSpy).not.toHaveBeenCalled()
    expect(mockToastShow).toHaveBeenCalledWith({
      type: "success",
      message: en.BankAccountsScreen.accountAdded(),
    })
  })

  it("sends setDefault: true when the switch is on, and trims the inputs", async () => {
    const add = jest.fn(() => ({
      data: {
        bankAccountAdd: {
          __typename: "BankAccountPayload",
          errors: [],
          bankAccount: storedAccount,
        },
      },
    }))
    const screen = renderScreen({ mode: "add" }, [
      {
        request: {
          query: BankAccountAddDocument,
          variables: { input: { ...addInput, setDefault: true } },
        },
        result: add,
      },
      refetchMock(),
    ])
    await fillAddForm(screen)
    fireEvent.changeText(
      screen.getByPlaceholderText(en.AccountUpgrade.bankBranchPlaceholder()),
      "  Half Way Tree ",
    )
    fireEvent(screen.getByTestId("bank-account-set-default"), "valueChange", true)

    fireEvent.press(screen.getByText(en.BankAccountsScreen.addAccount()))

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalledTimes(1))
    expect(add).toHaveBeenCalledTimes(1)
  })

  const errorCases: [string, string][] = [
    ["BANK_ACCOUNT_DUPLICATE_NUMBER", en.BankAccountsScreen.errorDuplicateNumber()],
    ["BANK_ACCOUNT_INVALID", en.BankAccountsScreen.errorInvalid()],
    ["INVALID_INPUT", en.BankAccountsScreen.errorInvalid()],
    ["TOO_MANY_REQUEST", en.BankAccountsScreen.errorTooManyRequests()],
    ["BANK_ACCOUNT_NOT_FOUND", en.BankAccountsScreen.errorNotFound()],
    // Unknown codes show the server's own message.
    ["SOME_NEW_CODE", "server message"],
  ]
  errorCases.forEach(([code, expected]) => {
    it(`maps ${code} to a clear message and stays on the form`, async () => {
      const screen = renderScreen({ mode: "add" }, [
        {
          request: { query: BankAccountAddDocument, variables: { input: addInput } },
          result: {
            data: {
              bankAccountAdd: {
                __typename: "BankAccountPayload",
                errors: [appError(code)],
                bankAccount: null,
              },
            },
          },
        },
      ])
      await fillAddForm(screen)

      fireEvent.press(screen.getByText(en.BankAccountsScreen.addAccount()))

      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      expect(alertSpy).toHaveBeenCalledWith("", expected)
      expect(navigation.goBack).not.toHaveBeenCalled()
      expect(mockToastShow).not.toHaveBeenCalled()
    })
  })

  it("falls back to generic copy when the payload has neither account nor error", async () => {
    const screen = renderScreen({ mode: "add" }, [
      {
        request: { query: BankAccountAddDocument, variables: { input: addInput } },
        result: {
          data: {
            bankAccountAdd: {
              __typename: "BankAccountPayload",
              errors: [],
              bankAccount: null,
            },
          },
        },
      },
    ])
    await fillAddForm(screen)

    fireEvent.press(screen.getByText(en.BankAccountsScreen.addAccount()))

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("", en.BankAccountsScreen.errorGeneric()),
    )
    expect(navigation.goBack).not.toHaveBeenCalled()
  })

  it("shows a network failure instead of throwing", async () => {
    const screen = renderScreen({ mode: "add" }, [
      {
        request: { query: BankAccountAddDocument, variables: { input: addInput } },
        error: new Error("Network request failed"),
      },
    ])
    await fillAddForm(screen)

    fireEvent.press(screen.getByText(en.BankAccountsScreen.addAccount()))

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("", "Network request failed"),
    )
    expect(navigation.goBack).not.toHaveBeenCalled()
  })

  it("BANK_ACCOUNT_UPGRADE_REQUIRED offers the account upgrade flow", async () => {
    const screen = renderScreen({ mode: "add" }, [
      {
        request: { query: BankAccountAddDocument, variables: { input: addInput } },
        result: {
          data: {
            bankAccountAdd: {
              __typename: "BankAccountPayload",
              errors: [appError("BANK_ACCOUNT_UPGRADE_REQUIRED")],
              bankAccount: null,
            },
          },
        },
      },
    ])
    await fillAddForm(screen)

    fireEvent.press(screen.getByText(en.BankAccountsScreen.addAccount()))

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
    const [title, message] = alertSpy.mock.calls[0]
    expect(title).toBe(en.BankAccountsScreen.upgradeRequiredTitle())
    expect(message).toBe(en.BankAccountsScreen.errorUpgradeRequired())
    expect(navigation.navigate).not.toHaveBeenCalled()

    await pressAlertButton(alertSpy, en.BankAccountsScreen.upgradeYourAccount())
    expect(navigation.navigate).toHaveBeenCalledWith("AccountType")
    expect(navigation.goBack).not.toHaveBeenCalled()
  })
})

describe("EditBankAccountScreen — edit", () => {
  const updateInput = {
    bankAccountId: "acc-1",
    bankName: "Scotiabank",
    bankBranch: "New Kingston",
    accountType: "Chequing",
    accountNumber: "87654321",
  }

  const editForm = async (screen: Screen) => {
    fireEvent.press(await screen.findByText("option:Scotiabank"))
    fireEvent.changeText(screen.getByDisplayValue("Half Way Tree"), "New Kingston")
    fireEvent.press(screen.getByText(`option:${en.BankAccountsScreen.chequing()}`))
    fireEvent.changeText(screen.getByDisplayValue("12345678"), "87654321")
  }

  it("prefills from the route, locks currency, drops the review copy and the default switch", async () => {
    const screen = renderScreen(editParams, [])
    await screen.findByText("option:NCB")

    expect(screen.getByText("selected:NCB")).toBeTruthy()
    expect(screen.getByText("selected:Savings")).toBeTruthy()
    expect(screen.getByDisplayValue("Half Way Tree")).toBeTruthy()
    expect(screen.getByDisplayValue("12345678")).toBeTruthy()
    expect(screen.getByDisplayValue("JMD").props.editable).toBe(false)
    expect(screen.getByText(en.BankAccountsScreen.editSubtitle())).toBeTruthy()
    expect(screen.getByText(en.BankAccountsScreen.currencyLocked())).toBeTruthy()
    expect(screen.queryByTestId("bank-account-set-default")).toBeNull()
    expect(screen.queryByText(/review/i)).toBeNull()
  })

  it("confirms, then updates instantly (no currency), refetches, toasts and goes back", async () => {
    const update = jest.fn(() => ({
      data: {
        bankAccountUpdate: {
          __typename: "BankAccountPayload",
          errors: [],
          bankAccount: { ...storedAccount, ...updateInput, id: "acc-1" },
        },
      },
    }))
    const refetch = refetchMock()
    const screen = renderScreen(editParams, [
      {
        request: { query: BankAccountUpdateDocument, variables: { input: updateInput } },
        result: update,
      },
      refetch,
    ])
    await editForm(screen)

    fireEvent.press(screen.getByText(en.BankAccountsScreen.saveChanges()))

    // Nothing is sent until the user confirms.
    expect(alertSpy).toHaveBeenCalledWith(
      en.BankAccountsScreen.confirmTitle(),
      en.BankAccountsScreen.confirmMessage(),
      expect.any(Array),
    )
    expect(update).not.toHaveBeenCalled()

    await pressAlertButton(alertSpy, en.BankAccountsScreen.saveChanges())

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledTimes(1)
    expect(refetch.result).toHaveBeenCalledTimes(1)
    expect(mockToastShow).toHaveBeenCalledWith({
      type: "success",
      message: en.BankAccountsScreen.accountUpdated(),
    })
  })

  it("requires a supported bank when the stored one is no longer offered", async () => {
    const update = jest.fn()
    const screen = renderScreen({ ...editParams, bankName: "Defunct Bank" }, [
      {
        request: { query: BankAccountUpdateDocument },
        result: update,
      },
    ])
    await screen.findByText("option:NCB")

    fireEvent.press(screen.getByText(en.BankAccountsScreen.saveChanges()))

    expect(screen.getByText(en.BankAccountsScreen.bankRequired())).toBeTruthy()
    expect(alertSpy).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it("maps an update error and stays on the form", async () => {
    const screen = renderScreen(editParams, [
      {
        request: { query: BankAccountUpdateDocument, variables: { input: updateInput } },
        result: {
          data: {
            bankAccountUpdate: {
              __typename: "BankAccountPayload",
              errors: [appError("BANK_ACCOUNT_DUPLICATE_NUMBER")],
              bankAccount: null,
            },
          },
        },
      },
    ])
    await editForm(screen)

    fireEvent.press(screen.getByText(en.BankAccountsScreen.saveChanges()))
    await pressAlertButton(alertSpy, en.BankAccountsScreen.saveChanges())

    await waitFor(() =>
      expect(alertSpy).toHaveBeenLastCalledWith(
        "",
        en.BankAccountsScreen.errorDuplicateNumber(),
      ),
    )
    expect(navigation.goBack).not.toHaveBeenCalled()
  })
})
