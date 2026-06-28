import { NativeModules } from "react-native"

export type WatchCurrencyData = {
  currencyCode: string
  currencySymbol: string
  fractionDigits: number
}

export type WatchReceiveQRCodeData = {
  receiveQRCode: string
  receiveAddress: string
  receiveLabel: string
}

const { WatchConnectivityBridge } = NativeModules as {
  WatchConnectivityBridge?: {
    syncCurrency: (data: WatchCurrencyData) => Promise<void>
    syncReceiveQRCode: (data: WatchReceiveQRCodeData) => Promise<void>
  }
}

/**
 * Pushes the user's display currency to the paired Apple Watch so the Flash
 * watch app and complication render BTC in the same currency as the phone. The
 * watch fetches the price itself, so this only carries the currency preference.
 *
 * Best-effort: iOS-only, and a no-op when the module isn't in the binary or no
 * watch is paired. Failures are swallowed — the watch falls back to USD.
 */
export const setWatchCurrency = async (data: WatchCurrencyData): Promise<void> => {
  try {
    if (!WatchConnectivityBridge?.syncCurrency) {
      return
    }
    await WatchConnectivityBridge.syncCurrency(data)
  } catch {
    // ignore — the watch falls back to its own currency (USD by default)
  }
}

export const setWatchReceiveQRCode = async (
  data: WatchReceiveQRCodeData,
): Promise<void> => {
  try {
    if (!WatchConnectivityBridge?.syncReceiveQRCode) {
      return
    }
    await WatchConnectivityBridge.syncReceiveQRCode(data)
  } catch {
    // ignore — the watch falls back to opening Receive on the phone
  }
}
