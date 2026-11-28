import React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { fireEvent, render } from "@testing-library/react-native"

import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import Fees from "@app/components/refund-flow/Fees"

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

const renderFees = (props: Partial<React.ComponentProps<typeof Fees>> = {}) => {
  const onSelectFee = jest.fn()
  const screen = render(
    <ThemeProvider theme={createTheme({})}>
      <Fees onSelectFee={onSelectFee} {...props} />
    </ThemeProvider>,
  )
  return { ...screen, onSelectFee }
}

describe("Fees", () => {
  beforeAll(() => loadLocale("en"))

  it("without the optional props, shows the three speeds and every one can be picked", () => {
    const { getByText, queryByText, onSelectFee } = renderFees()

    expect(getByText("Recommended Fees")).toBeTruthy()
    fireEvent.press(getByText("Fast"))
    fireEvent.press(getByText("Medium"))
    fireEvent.press(getByText("Slow"))
    expect(onSelectFee.mock.calls).toEqual([["fast"], ["medium"], ["slow"]])
    expect(queryByText(/sats/)).toBeNull()
    expect(getByText("Fast")).not.toBeDisabled()
  })

  it("shows each speed's fee under its name", () => {
    const { getByText } = renderFees({
      feeLabels: {
        fast: "$1.23 (1,230 sats)",
        medium: "$0.81 (810 sats)",
        slow: "$0.42 (420 sats)",
      },
    })
    expect(getByText("$1.23 (1,230 sats)")).toBeTruthy()
    expect(getByText("$0.81 (810 sats)")).toBeTruthy()
    expect(getByText("$0.42 (420 sats)")).toBeTruthy()
  })

  it("a disabled speed cannot be picked; the others still can", () => {
    const { getByText, onSelectFee } = renderFees({ disabledFeeTypes: ["fast"] })
    expect(getByText("Fast")).toBeDisabled()
    expect(getByText("Slow")).not.toBeDisabled()

    fireEvent.press(getByText("Fast"))
    expect(onSelectFee).not.toHaveBeenCalled()

    fireEvent.press(getByText("Slow"))
    expect(onSelectFee).toHaveBeenCalledWith("slow")
  })
})
