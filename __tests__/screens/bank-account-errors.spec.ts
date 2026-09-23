import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { bankAccountErrorMessage } from "@app/screens/settings-screen/bank-accounts/bank-account-errors"

loadLocale("en")
const LL = i18nObject("en")

describe("bankAccountErrorMessage", () => {
  it("shows the server's reason for BANK_ACCOUNT_INVALID", () => {
    // Seen on TEST: the server named the problem ("This account number
    // cannot be used...") and the app replaced it with the generic line.
    const message =
      "This account number cannot be used. Please contact support if it is yours."

    expect(bankAccountErrorMessage(LL, { code: "BANK_ACCOUNT_INVALID", message })).toBe(
      message,
    )
  })

  it("falls back to the generic invalid line when the server sends no message", () => {
    expect(
      bankAccountErrorMessage(LL, { code: "BANK_ACCOUNT_INVALID", message: "" }),
    ).toBe(LL.BankAccountsScreen.errorInvalid())
  })

  it("keeps our own copy for codes that have it", () => {
    expect(
      bankAccountErrorMessage(LL, {
        code: "BANK_ACCOUNT_DUPLICATE_NUMBER",
        message: "x",
      }),
    ).toBe(LL.BankAccountsScreen.errorDuplicateNumber())
    expect(bankAccountErrorMessage(LL, { code: "TOO_MANY_REQUEST", message: "x" })).toBe(
      LL.BankAccountsScreen.errorTooManyRequests(),
    )
  })

  it("shows the server message for unknown codes, then the generic fallback", () => {
    expect(bankAccountErrorMessage(LL, { code: "SOMETHING_NEW", message: "hello" })).toBe(
      "hello",
    )
    expect(bankAccountErrorMessage(LL, undefined)).toBe(
      LL.BankAccountsScreen.errorGeneric(),
    )
  })
})
