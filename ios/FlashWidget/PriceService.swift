//
//  PriceService.swift
//  FlashWidget
//
//  Lets the widget fetch a fresh BTC price on its own and pull the same
//  one-month chart data used by the Flash BTC price screen.
//

import Foundation

enum PriceService {
  static let endpoint = URL(string: "https://api.flashapp.me/graphql")!

  static let priceQuery = """
  query realtimePriceUnauthed($currency: DisplayCurrency!) {
    realtimePrice(currency: $currency) {
      timestamp
      btcSatPrice { base offset }
      denominatorCurrency
    }
  }
  """

  static let historyQuery = """
  query btcPriceListUnauthed($range: PriceGraphRange!) {
    btcPriceList(range: $range) {
      timestamp
      price { base offset currencyUnit }
    }
  }
  """

  // MARK: - Current price

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
      "query": priceQuery,
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
      SharedStore.writePrice(snapshot)
      // Don't append to history here — the 30D fetch is the authoritative source
      completion(snapshot)
    }.resume()
  }

  // MARK: - 30-day price history for chart

  /// Fetches one month of price data and converts it the same way the React
  /// Native BTC price screen does: `(base / 10^offset) * multiple(currencyUnit)`.
  /// This gives the BTC price in the display currency's major units, matching
  /// the watch app exactly.
  static func fetchHistory(
    currencyCode: String = "USD",
    fractionDigits: Int = 2,
    completion: @escaping ([PricePoint]) -> Void
  ) {
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.timeoutInterval = 15

    let body: [String: Any] = [
      "query": historyQuery,
      "variables": ["range": "ONE_MONTH"],
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: body) else {
      completion([])
      return
    }
    request.httpBody = data

    URLSession.shared.dataTask(with: request) { data, _, _ in
      guard
        let data = data,
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let dataObj = json["data"] as? [String: Any],
        let priceList = dataObj["btcPriceList"] as? [[String: Any]]
      else {
        completion([])
        return
      }

      let points: [PricePoint] = priceList.compactMap { item in
        guard let timestamp = (item["timestamp"] as? NSNumber)?.doubleValue,
              let priceObj = item["price"] as? [String: Any],
              let base = (priceObj["base"] as? NSNumber)?.doubleValue,
              let offset = (priceObj["offset"] as? NSNumber)?.doubleValue
        else { return nil }

        let currencyUnit = priceObj["currencyUnit"] as? String ?? ""
        // Same conversion as the Flash price-history screen and the watch app
        let btcPrice = (base / pow(10, offset)) * multiple(for: currencyUnit)
        return PricePoint(price: btcPrice, timestamp: timestamp)
      }

      let sampled = samplePoints(points, maxCount: 140)
      SharedStore.writeHistory(sampled)
      completion(sampled)
    }.resume()
  }

  /// Matches the conversion helper in app/components/price-history/price-history.tsx.
  private static func multiple(for currencyUnit: String) -> Double {
    switch currencyUnit {
    case "USDCENT":
      return pow(10, -5)
    default:
      return 1
    }
  }

  /// Evenly samples an array to `maxCount` elements while preserving endpoints.
  private static func samplePoints(_ points: [PricePoint], maxCount: Int) -> [PricePoint] {
    guard points.count > maxCount else { return points }
    let lastIndex = points.count - 1
    return (0..<maxCount).map { i in
      let position = Double(i) * Double(lastIndex) / Double(maxCount - 1)
      return points[Int(position.rounded())]
    }
  }
}
