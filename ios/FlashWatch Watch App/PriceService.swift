//
//  PriceService.swift
//  FlashWatch
//
//  Lets the watch app and complication fetch a fresh BTC price on their own and
//  pull the same one-month chart data used by the iOS price screen/widget.
//

import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

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

  static func fetch(
    previous: PriceSnapshot,
    completion: @escaping (PriceSnapshot) -> Void
  ) {
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.timeoutInterval = 12

    let body: [String: Any] = [
      "query": priceQuery,
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
      // No history append: the 30D fetch is the authoritative source, and this
      // snapshot is in the user's display currency while history is USD —
      // mixing units corrupts the chart. No complication reload either: the
      // complication provider runs this same fetch, and reloading from inside
      // a timeline generation self-invalidates in a loop. The watch app
      // triggers the reload instead (ContentView.refreshAll).
      completion(snapshot)
    }.resume()
  }

  static func fetch(previous: PriceSnapshot) async -> PriceSnapshot {
    await withCheckedContinuation { continuation in
      fetch(previous: previous) { snapshot in
        continuation.resume(returning: snapshot)
      }
    }
  }

  static func fetchHistory(completion: @escaping ([PricePoint]) -> Void) {
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
        guard
          let timestamp = (item["timestamp"] as? NSNumber)?.doubleValue,
          let priceObj = item["price"] as? [String: Any],
          let base = (priceObj["base"] as? NSNumber)?.doubleValue,
          let offset = (priceObj["offset"] as? NSNumber)?.doubleValue
        else {
          return nil
        }

        let currencyUnit = priceObj["currencyUnit"] as? String ?? ""
        let btcPrice = (base / pow(10, offset)) * multiple(for: currencyUnit)
        return PricePoint(price: btcPrice, timestamp: timestamp)
      }

      let sampled = samplePoints(points, maxCount: 140)
      WatchStore.writeHistory(sampled)
      completion(sampled)
    }.resume()
  }

  static func fetchHistory() async -> [PricePoint] {
    await withCheckedContinuation { continuation in
      fetchHistory { points in
        continuation.resume(returning: points)
      }
    }
  }

  private static func multiple(for currencyUnit: String) -> Double {
    switch currencyUnit {
    case "USDCENT":
      return pow(10, -5)
    default:
      return 1
    }
  }

  private static func samplePoints(_ points: [PricePoint], maxCount: Int) -> [PricePoint] {
    guard points.count > maxCount else { return points }
    let lastIndex = points.count - 1
    return (0..<maxCount).map { i in
      let position = Double(i) * Double(lastIndex) / Double(maxCount - 1)
      return points[Int(position.rounded())]
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
