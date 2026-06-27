//
//  PriceService.swift
//  FlashWidget
//
//  Lets the widget fetch a fresh BTC price on its own (even when the app is
//  closed) using the public, unauthenticated `realtimePrice` GraphQL query.
//  The currency + fractionDigits come from the last snapshot the app wrote, so
//  the widget always renders in the user's chosen display currency.
//

import Foundation

enum PriceService {
  /// Production Flash GraphQL endpoint (see app/config/galoy-instances.ts → "Main").
  static let endpoint = URL(string: "https://api.flashapp.me/graphql")!

  static let query = """
  query realtimePriceUnauthed($currency: DisplayCurrency!) {
    realtimePrice(currency: $currency) {
      timestamp
      btcSatPrice { base offset }
      denominatorCurrency
    }
  }
  """

  /// Fetches the latest price for `currencyCode`, converts it to a major-unit
  /// BTC price using `fractionDigits`, and returns an updated snapshot. Falls
  /// back to `previous` on any failure so the widget never shows an empty state
  /// once it has data.
  static func fetch(
    currencyCode: String,
    fractionDigits: Int,
    symbol: String,
    previous: PriceSnapshot,
    completion: @escaping (PriceSnapshot) -> Void
  ) {
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.timeoutInterval = 12

    let body: [String: Any] = [
      "query": query,
      "variables": ["currency": currencyCode],
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: body) else {
      completion(previous)
      return
    }
    request.httpBody = data

    URLSession.shared.dataTask(with: request) { data, _, _ in
      guard
        let data = data,
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let dataObj = json["data"] as? [String: Any],
        let realtime = dataObj["realtimePrice"] as? [String: Any],
        let btcSat = realtime["btcSatPrice"] as? [String: Any],
        let base = (btcSat["base"] as? NSNumber)?.doubleValue,
        let offset = (btcSat["offset"] as? NSNumber)?.doubleValue
      else {
        completion(previous)
        return
      }

      // displayCurrencyPerSat is in the display currency's MINOR units per sat.
      // 1 BTC = 100,000,000 sats → major-unit price = perSat * 1e8 / 10^fractionDigits.
      let displayCurrencyPerSat = base / pow(10, offset)
      let btcPrice = displayCurrencyPerSat * 100_000_000 / pow(10, Double(fractionDigits))
      let ts = (realtime["timestamp"] as? NSNumber)?.doubleValue ?? previous.timestamp

      let snapshot = PriceSnapshot(
        btcPrice: btcPrice,
        currencyCode: currencyCode,
        currencySymbol: symbol,
        fractionDigits: fractionDigits,
        timestamp: ts
      )
      SharedStore.write(snapshot)
      completion(snapshot)
    }.resume()
  }
}
