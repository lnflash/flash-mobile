import * as React from "react"
import { Share } from "react-native"
import { act, fireEvent } from "@testing-library/react-native"
import Clipboard from "@react-native-clipboard/clipboard"

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

import { invoiceFixture } from "@app/assistant/cards/fixtures"
import { InvoiceCard } from "@app/assistant/cards/InvoiceCard"
import { en, renderCard } from "./render-card"

const show = (payload: unknown) => renderCard(<InvoiceCard payload={payload} />)

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe("InvoiceCard", () => {
  it("shows the QR, the amount and the wallet that receives", () => {
    const screen = show(invoiceFixture)

    expect(screen.getByTestId("assistant-card-qr")).toBeTruthy()
    expect(screen.getByTestId("assistant-card-amount").props.accessibilityLabel).toBe(
      `${en.SendBitcoinScreen.amount()}, J$785.00 ($5.00)`,
    )
    expect(screen.getByTestId("assistant-card-wallet").props.accessibilityLabel).toBe(
      `${en.common.to()}, ${en.common.usdAccount()}`,
    )
  })

  it("copies and shares the request in full", () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" })
    const screen = show(invoiceFixture)

    fireEvent.press(screen.getByTestId("assistant-card-copy"))
    fireEvent.press(screen.getByTestId("assistant-card-share"))

    expect(Clipboard.setString).toHaveBeenCalledWith(invoiceFixture.shareText)
    expect(share).toHaveBeenCalledWith({ message: invoiceFixture.shareText })
    expect(screen.getByText(en.common.copied())).toBeTruthy()
  })

  it("counts down as the receive screen does, then hides the QR and the buttons", () => {
    jest.useFakeTimers()
    const screen = show({ ...invoiceFixture, expiresAt: Date.now() + 90_000 })
    expect(screen.getByTestId("assistant-card-validity").props.children).toBe(
      `${en.ReceiveScreen.singleUse()} | ${en.ReceiveScreen.invoiceValidity.expiresIn({
        duration: "1m30s",
      })}`,
    )

    act(() => {
      jest.advanceTimersByTime(90_000)
    })

    expect(screen.getByText(en.ReceiveScreen.invoiceExpired())).toBeTruthy()
    expect(screen.queryByTestId("assistant-card-qr")).toBeNull()
    expect(screen.queryByTestId("assistant-card-copy")).toBeNull()
    expect(screen.queryByTestId("assistant-card-share")).toBeNull()
  })

  it("says an on-chain address is one, with no countdown", () => {
    const { expiresAt: _expiry, ...address } = invoiceFixture
    const screen = show({ ...address, method: "onchain", receiveWallet: "BTC" })

    expect(screen.getByText(en.ReceiveScreen.yourBitcoinOnChainAddress())).toBeTruthy()
  })

  it("refuses a payload without its request", () => {
    const { paymentRequest: _request, ...missing } = invoiceFixture

    expect(show(missing).getByTestId("assistant-card-error")).toBeTruthy()
  })
})
