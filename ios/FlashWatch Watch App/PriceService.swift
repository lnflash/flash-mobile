//
//  PriceService.swift
//  FlashWatch
//
//  Lets the watch app and its complication fetch a fresh BTC price on their own
//  — even when the iPhone is away — using the public, unauthenticated
//  `realtimePrice` GraphQL query. The currency + fractionDigits come from the
//  last snapshot (seeded by the phone over WatchConnectivity, or defaulting to
//  USD), so the watch always renders in the user's chosen display currency.
//
//  This intentionally mirrors ios/FlashWidget/PriceService.swift; the watch is a
//  separate target/device, so the code is duplicated rather than shared.
//

import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

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

  /// Fetches the latest price for the currency stored in `previous`, converts it
  /// to a major-unit BTC price, persists it to `WatchStore`, reloads any
  /// complications, and returns the new snapshot. Falls back to `previous` on
  /// any failure so the UI never blanks out once it has data.
  static func fetch(
    previous: PriceSnapshot,
    completion: @escaping (PriceSnapshot) -> Void
  ) {
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.timeoutInterval = 12

    let body: [String: Any] = [
      "query": query,
      "variables": ["currency": previous.currencyCode],
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
      let btcPrice =
        displayCurrencyPerSat * 100_000_000 / pow(10, Double(previous.fractionDigits))
      let ts = (realtime["timestamp"] as? NSNumber)?.doubleValue ?? Date().timeIntervalSince1970

      let snapshot = PriceSnapshot(
        btcPrice: btcPrice,
        currencyCode: previous.currencyCode,
        currencySymbol: previous.currencySymbol,
        fractionDigits: previous.fractionDigits,
        timestamp: ts
      )
      WatchStore.write(snapshot)
      reloadComplications()
      completion(snapshot)
    }.resume()
  }

  /// async/await convenience for the SwiftUI view layer.
  static func fetch(previous: PriceSnapshot) async -> PriceSnapshot {
    await withCheckedContinuation { continuation in
      fetch(previous: previous) { snapshot in
        continuation.resume(returning: snapshot)
      }
    }
  }

  static func reloadComplications() {
    #if canImport(WidgetKit)
    if #available(watchOS 9.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
    #endif
  }
}
