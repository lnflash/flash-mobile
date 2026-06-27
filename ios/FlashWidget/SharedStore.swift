//
//  SharedStore.swift
//  FlashWidget
//
//  Reads/writes the price snapshot shared between the main app and the widget
//  via an App Group UserDefaults suite. The main app (React Native) pushes the
//  latest price through the `WidgetBridge` native module; the widget reads it
//  here and can also refresh it on its own via `PriceService`.
//

import Foundation

enum SharedStore {
  /// Must match the App Group id enabled on BOTH the app target and the widget
  /// extension target (see ios/LNFlash/*.entitlements and FlashWidget.entitlements).
  static let appGroupId = "group.com.lnflash"

  enum Key {
    static let btcPrice = "btcPrice"
    static let currencyCode = "currencyCode"
    static let currencySymbol = "currencySymbol"
    static let fractionDigits = "fractionDigits"
    static let timestamp = "timestamp"
  }

  static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroupId)
  }

  static func read() -> PriceSnapshot {
    let d = defaults
    return PriceSnapshot(
      btcPrice: d?.double(forKey: Key.btcPrice) ?? 0,
      currencyCode: d?.string(forKey: Key.currencyCode) ?? "USD",
      currencySymbol: d?.string(forKey: Key.currencySymbol) ?? "$",
      // `object(forKey:) == nil` lets us default to 2 instead of 0 on first run.
      fractionDigits: (d?.object(forKey: Key.fractionDigits) as? Int) ?? 2,
      timestamp: d?.double(forKey: Key.timestamp) ?? 0
    )
  }

  static func write(_ snapshot: PriceSnapshot) {
    guard let d = defaults else { return }
    d.set(snapshot.btcPrice, forKey: Key.btcPrice)
    d.set(snapshot.currencyCode, forKey: Key.currencyCode)
    d.set(snapshot.currencySymbol, forKey: Key.currencySymbol)
    d.set(snapshot.fractionDigits, forKey: Key.fractionDigits)
    d.set(snapshot.timestamp, forKey: Key.timestamp)
  }
}

struct PriceSnapshot {
  var btcPrice: Double
  var currencyCode: String
  var currencySymbol: String
  var fractionDigits: Int
  var timestamp: Double

  var hasPrice: Bool { btcPrice > 0 }

  /// e.g. "$67,231" or "$67,231.50" depending on the currency's fraction digits.
  var formattedPrice: String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = fractionDigits
    formatter.minimumFractionDigits = fractionDigits
    let number = formatter.string(from: NSNumber(value: btcPrice)) ?? "—"
    return "\(currencySymbol)\(number)"
  }
}
