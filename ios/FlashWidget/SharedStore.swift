//
//  SharedStore.swift
//  FlashWidget
//
//  Reads/writes price data shared between the main app and the widget via an
//  App Group UserDefaults suite.
//

import Foundation

enum SharedStore {
  static let appGroupId = "group.com.lnflash"

  enum Key {
    // Price snapshot
    static let btcPrice = "btcPrice"
    static let currencyCode = "currencyCode"
    static let currencySymbol = "currencySymbol"
    static let fractionDigits = "fractionDigits"
    static let timestamp = "timestamp"

    // Price history (sparkline data)
    static let priceHistory = "priceHistory"

  }

  static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroupId)
  }

  // MARK: - Price snapshot

  static func readPrice() -> PriceSnapshot {
    let d = defaults
    return PriceSnapshot(
      btcPrice: d?.double(forKey: Key.btcPrice) ?? 0,
      currencyCode: d?.string(forKey: Key.currencyCode) ?? "USD",
      currencySymbol: d?.string(forKey: Key.currencySymbol) ?? "$",
      fractionDigits: (d?.object(forKey: Key.fractionDigits) as? Int) ?? 2,
      timestamp: d?.double(forKey: Key.timestamp) ?? 0
    )
  }

  static func writePrice(_ snapshot: PriceSnapshot) {
    guard let d = defaults else { return }
    d.set(snapshot.btcPrice, forKey: Key.btcPrice)
    d.set(snapshot.currencyCode, forKey: Key.currencyCode)
    d.set(snapshot.currencySymbol, forKey: Key.currencySymbol)
    d.set(snapshot.fractionDigits, forKey: Key.fractionDigits)
    d.set(snapshot.timestamp, forKey: Key.timestamp)
  }

  // MARK: - Price history (sparkline)

  static func readHistory() -> [PricePoint] {
    guard let data = defaults?.data(forKey: Key.priceHistory),
          let points = try? JSONDecoder().decode([PricePoint].self, from: data)
    else { return [] }
    let sanitized = sanitizeHistory(points)
    if sanitized.count != points.count {
      writeHistory(sanitized)
    }
    return sanitized
  }

  static func writeHistory(_ history: [PricePoint]) {
    guard let data = try? JSONEncoder().encode(sanitizeHistory(history)) else { return }
    defaults?.set(data, forKey: Key.priceHistory)
  }

  static func appendHistory(_ snapshot: PriceSnapshot) {
    var history = readHistory()
    let point = PricePoint(price: snapshot.btcPrice, timestamp: snapshot.timestamp)
    history.append(point)
    // Keep enough points for the one-month chart plus a current-price append.
    if history.count > 160 { history.removeFirst(history.count - 160) }
    writeHistory(history)
  }

  private static func sanitizeHistory(_ history: [PricePoint]) -> [PricePoint] {
    let valid = history
      .filter { $0.price.isFinite && $0.price > 0 && $0.timestamp.isFinite }
      .sorted { $0.timestamp < $1.timestamp }

    guard valid.count > 1 else { return valid }

    let prices = valid.map(\.price)
    guard let minPrice = prices.min(), let maxPrice = prices.max(), minPrice > 0 else {
      return []
    }

    // Older widget builds cached mixed-unit chart data. A one-month BTC chart
    // should never span orders of magnitude, so discard that stale cache and
    // let the next timeline fetch write the authoritative watch-style history.
    guard maxPrice / minPrice <= 20 else { return [] }

    return valid
  }

}

// MARK: - Data models

struct PricePoint: Codable {
  let price: Double
  let timestamp: Double
}

struct PriceSnapshot {
  var btcPrice: Double
  var currencyCode: String
  var currencySymbol: String
  var fractionDigits: Int
  var timestamp: Double

  var hasPrice: Bool { btcPrice > 0 }

  var formattedPrice: String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = fractionDigits
    formatter.minimumFractionDigits = fractionDigits
    let number = formatter.string(from: NSNumber(value: btcPrice)) ?? "—"
    return "\(currencySymbol)\(number)"
  }
}
