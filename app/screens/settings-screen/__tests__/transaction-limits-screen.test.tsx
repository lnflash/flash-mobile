import React from "react"
import { render } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { i18nObject } from "../../../i18n/i18n-util"
import { loadAllLocales } from "../../../i18n/i18n-util.sync"
import { TransactionLimitsScreen } from "../transaction-limits-screen"
import { AccountLevel } from "@app/graphql/level-context"

loadAllLocales()

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => true,
}))

jest.mock("@app/hooks", () => ({
  useAppConfig: () => ({ appConfig: { galoyInstance: { name: "Flash" } } }),
}))

// TransactionLimitsPeriod pulls in price-conversion and display-currency
// context; stub it to a marker so the tests assert WHICH limits the screen
// renders (values + interval) without standing up that machinery.
jest.mock("@app/components/transaction-limits", () => {
  const ReactActual = jest.requireActual("react")
  const { Text: RNText } = jest.requireActual("react-native")
  return {
    TransactionLimitsPeriod: ({
      totalLimit,
      interval,
    }: {
      totalLimit: number
      interval?: number | null
    }) => ReactActual.createElement(RNText, null, `limit:${totalLimit}:${interval}`),
  }
})

const mockUseAccountLimitsQuery = jest.fn()
const mockUseTransferFlagsQuery = jest.fn()
const mockUseCardTopupLimitsQuery = jest.fn()
const mockUseLevelQuery = jest.fn()
jest.mock("@app/graphql/generated", () => ({
  useAccountLimitsQuery: (...args: unknown[]) => mockUseAccountLimitsQuery(...args),
  useTransferFlagsQuery: (...args: unknown[]) => mockUseTransferFlagsQuery(...args),
  useCardTopupLimitsQuery: (...args: unknown[]) => mockUseCardTopupLimitsQuery(...args),
  useLevelQuery: (...args: unknown[]) => mockUseLevelQuery(...args),
}))

// The ACH section is gated on the same resolved bridge flag the topup entry
// screen uses (backend bridgeEnabled AND the Firebase kill switch). Mocked at
// the hook level so the test doesn't stand up Firebase remote config.
const mockUseTransferFlags = jest.fn()
jest.mock("@app/hooks/use-transfer-flags", () => ({
  useTransferFlags: (...args: unknown[]) => mockUseTransferFlags(...args),
}))

const en = i18nObject("en")

const LIMIT = (total: number) => ({
  totalLimit: total,
  remainingLimit: total,
  interval: 86400,
})

const accountLimitsResult = (convert: ReturnType<typeof LIMIT>[] = []) => ({
  data: {
    me: {
      id: "user-1",
      defaultAccount: {
        id: "acct-1",
        limits: {
          // Distinct from every card-cap cents value so the stubbed
          // limit:<cents>:<interval> markers stay unique per section.
          withdrawal: [LIMIT(111100)],
          internalSend: [LIMIT(222200)],
          convert,
        },
      },
    },
  },
  loading: false,
  error: undefined,
  refetch: jest.fn(),
})

const FYGARO_TOPUP = {
  __typename: "FygaroTopupInfo" as const,
  minimumAmount: 10,
  processorFeePercent: 2.99,
  processorFeeFixed: 0.49,
  flashFeePercent: 2,
  flashFeeFixed: 0,
}

const DAILY_LIMITS = {
  __typename: "FygaroTopupInfo" as const,
  l1DailyLimit: 125,
  l2DailyLimit: 1000,
  l3DailyLimit: 2500,
}

const renderScreen = (level: AccountLevel = AccountLevel.One) => {
  // useCardTopupLimit resolves the level from the level query directly
  // (cache-and-network), not from the useLevel() context — see the hook.
  mockUseLevelQuery.mockReturnValue({
    data:
      level === AccountLevel.NonAuth
        ? undefined
        : {
            me: {
              __typename: "User" as const,
              id: "user-1",
              defaultAccount: {
                __typename: "ConsumerAccount" as const,
                id: "acct-1",
                level,
              },
            },
          },
    loading: false,
  })
  return render(
    <ThemeProvider theme={theme}>
      <TransactionLimitsScreen />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUseAccountLimitsQuery.mockReturnValue(accountLimitsResult())
  mockUseTransferFlagsQuery.mockReturnValue({
    data: { globals: { __typename: "Globals", fygaroTopup: FYGARO_TOPUP } },
    loading: false,
  })
  mockUseCardTopupLimitsQuery.mockReturnValue({
    data: { globals: { __typename: "Globals", fygaroTopup: DAILY_LIMITS } },
    loading: false,
  })
  mockUseLevelQuery.mockReturnValue({ data: undefined, loading: false })
  mockUseTransferFlags.mockReturnValue({ bridgeEnabled: true })
})

describe("TransactionLimitsScreen", () => {
  it("shows the card top-up section with the user's level cap and the minimum", () => {
    const { queryByText } = renderScreen(AccountLevel.One)

    expect(queryByText(en.TransactionLimitsScreen.cardTopup())).not.toBeNull()
    // $125 cap rendered in cents with the daily interval
    expect(queryByText("limit:12500:86400")).not.toBeNull()
    expect(
      queryByText(en.TransactionLimitsScreen.cardTopupMinimum({ amount: "$10.00" })),
    ).not.toBeNull()
  })

  it("shows the level-2 cap for a level-2 account", () => {
    const { queryByText } = renderScreen(AccountLevel.Two)

    expect(queryByText("limit:100000:86400")).not.toBeNull()
  })

  it("hides the card top-up section when no cap applies (level 0)", () => {
    const { queryByText } = renderScreen(AccountLevel.Zero)

    expect(queryByText(en.TransactionLimitsScreen.cardTopup())).toBeNull()
  })

  it("hides the card top-up section when fygaroTopup is unavailable", () => {
    mockUseTransferFlagsQuery.mockReturnValue({
      data: { globals: { __typename: "Globals", fygaroTopup: null } },
      loading: false,
    })
    mockUseCardTopupLimitsQuery.mockReturnValue({
      data: { globals: { __typename: "Globals", fygaroTopup: null } },
      loading: false,
    })
    const { queryByText } = renderScreen(AccountLevel.One)

    expect(queryByText(en.TransactionLimitsScreen.cardTopup())).toBeNull()
  })

  it("hides only the card section on a backend without the daily-limit fields", () => {
    // Old backend: the isolated cardTopupLimits query fails validation and
    // returns no data; the rest of the screen (fed by other queries) must
    // render untouched.
    mockUseCardTopupLimitsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error("GRAPHQL_VALIDATION_FAILED"),
    })
    const { queryByText } = renderScreen(AccountLevel.One)

    expect(queryByText(en.TransactionLimitsScreen.cardTopup())).toBeNull()
    expect(queryByText(en.TransactionLimitsScreen.withdraw())).not.toBeNull()
    expect(queryByText(en.TransactionLimitsScreen.bankTransferAch())).not.toBeNull()
  })

  it("shows the ACH bank-transfer minimum when bridge is enabled", () => {
    const { queryByText } = renderScreen(AccountLevel.One)

    expect(queryByText(en.TransactionLimitsScreen.bankTransferAch())).not.toBeNull()
    expect(queryByText(en.BankTransfer.achMinimumNotice())).not.toBeNull()
  })

  it("hides the ACH section when bridge is disabled on this instance", () => {
    // Same gate the topup entry screen uses to offer bridge (backend
    // bridgeEnabled AND the Firebase kill switch): a bridge-less instance
    // must not advertise an ACH rail the app offers nowhere.
    mockUseTransferFlags.mockReturnValue({ bridgeEnabled: false })
    const { queryByText } = renderScreen(AccountLevel.One)

    expect(queryByText(en.TransactionLimitsScreen.bankTransferAch())).toBeNull()
    expect(queryByText(en.BankTransfer.achMinimumNotice())).toBeNull()
    // The rest of the screen renders untouched.
    expect(queryByText(en.TransactionLimitsScreen.withdraw())).not.toBeNull()
    expect(queryByText(en.TransactionLimitsScreen.cardTopup())).not.toBeNull()
  })

  it("renders the Stablesat convert limits when the account has them", () => {
    mockUseAccountLimitsQuery.mockReturnValue(accountLimitsResult([LIMIT(50000)]))
    const { queryByText } = renderScreen(AccountLevel.One)

    expect(queryByText(en.TransactionLimitsScreen.stablesatTransfers())).not.toBeNull()
    expect(queryByText("limit:50000:86400")).not.toBeNull()
  })

  it("hides the Stablesat section when the account has no convert limits", () => {
    const { queryByText } = renderScreen(AccountLevel.One)

    expect(queryByText(en.TransactionLimitsScreen.stablesatTransfers())).toBeNull()
  })
})
