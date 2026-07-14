import { NativeModules } from "react-native"

export type WidgetPriceData = {
  /** BTC price in the display currency's MAJOR units (e.g. 67231.5 for $67,231.50). */
  btcPrice: number
  currencyCode: string
  currencySymbol: string
  fractionDigits: number
  /** Unix epoch seconds. */
  timestamp: number
}

const { WidgetBridge } = NativeModules as {
  WidgetBridge?: {
    setPriceData: (data: WidgetPriceData) => Promise<void>
  }
}

/**
 * Pushes the latest price snapshot into native shared storage so the
 * home-screen widget can render it. Best-effort.
 */
export const setWidgetPriceData = async (data: WidgetPriceData): Promise<void> => {
  try {
    if (!WidgetBridge?.setPriceData) return
    await WidgetBridge.setPriceData(data)
  } catch {
    // ignore — the widget falls back to its own price fetch
  }
}
