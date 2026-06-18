import * as React from "react"
import { render } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"

import { CurrencyTag } from "@app/components/currency-tag"
import { WalletCurrency } from "@app/graphql/generated"
import theme from "@app/rne-theme/theme"

const renderCurrencyTag = (walletCurrency: WalletCurrency) =>
  render(
    <ThemeProvider theme={theme}>
      <CurrencyTag walletCurrency={walletCurrency} />
    </ThemeProvider>,
  )

describe("CurrencyTag", () => {
  it.each([WalletCurrency.Btc, WalletCurrency.Usd, WalletCurrency.Usdt])(
    "renders a %s tag",
    (walletCurrency) => {
      const { getByText } = renderCurrencyTag(walletCurrency)

      expect(getByText(walletCurrency)).toBeTruthy()
    },
  )
})
