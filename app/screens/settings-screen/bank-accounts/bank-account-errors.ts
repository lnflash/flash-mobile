import { TranslationFunctions } from "@app/i18n/i18n-types"

// Error codes returned by bankAccountAdd / Update / SetDefault / Delete.
export const BANK_ACCOUNT_UPGRADE_REQUIRED = "BANK_ACCOUNT_UPGRADE_REQUIRED"

type BankAccountError = { code?: string | null; message?: string | null }

/**
 * User-facing message for a bank-account mutation error. Known codes get our
 * own copy; anything else shows the server message, then a generic fallback.
 */
export const bankAccountErrorMessage = (
  LL: TranslationFunctions,
  error?: BankAccountError | null,
): string => {
  switch (error?.code) {
    case BANK_ACCOUNT_UPGRADE_REQUIRED:
      return LL.BankAccountsScreen.errorUpgradeRequired()
    case "BANK_ACCOUNT_NOT_FOUND":
      return LL.BankAccountsScreen.errorNotFound()
    case "BANK_ACCOUNT_DUPLICATE_NUMBER":
      return LL.BankAccountsScreen.errorDuplicateNumber()
    case "BANK_ACCOUNT_INVALID":
    case "INVALID_INPUT":
      return LL.BankAccountsScreen.errorInvalid()
    case "TOO_MANY_REQUEST":
      return LL.BankAccountsScreen.errorTooManyRequests()
    default:
      return error?.message || LL.BankAccountsScreen.errorGeneric()
  }
}
