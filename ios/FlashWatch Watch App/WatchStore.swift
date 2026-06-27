//
//  WatchStore.swift
//  FlashWatch
//
//  Reads/writes the BTC price snapshot shared between the watch app and its
//  complication via an App Group UserDefaults suite. This is a *watch-local*
//  App Group — the iOS app group (group.com.lnflash) lives on a different
//  device and cannot be reached from the watch.
//
//  The snapshot is populated two ways:
//   1. The watch app / complication fetch it themselves via `PriceService`
//      (public, unauthenticated query — works even with the phone away).
//   2. The paired iPhone pushes the user's chosen display currency through
//      WatchConnectivity (see PhoneConnectivity.swift), so the watch renders
//      in the same currency as the phone instead of defaulting to USD.
//
//  Mirrors ios/FlashWidget/SharedStore.swift so the two stay conceptually in
//  sync.
//

import Foundation

enum WatchStore {
  /// Must match the App Group id enabled on BOTH the watch app target and the
  /// complication extension target (see FlashWatch.entitlements). This is a
  /// distinct group from the iOS app's `group.com.lnflash`.
  static let appGroupId = "group.com.lnflash.watch"

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

  /// Updates only the currency fields (used when the phone pushes the user's
  /// display currency but no fresh price). Keeps the last known price so the UI
  /// never blanks out, then lets the next fetch reprice in the new currency.
  static func writeCurrency(code: String, symbol: String, fractionDigits: Int) {
    guard let d = defaults else { return }
    d.set(code, forKey: Key.currencyCode)
    d.set(symbol, forKey: Key.currencySymbol)
    d.set(fractionDigits, forKey: Key.fractionDigits)
  }
}

struct PriceSnapshot: Equatable {
  var btcPrice: Double
  var currencyCode: String
  var currencySymbol: String
  var fractionDigits: Int
  var timestamp: Double

  var hasPrice: Bool { btcPrice > 0 }

  var updatedAt: Date? {
    timestamp > 0 ? Date(timeIntervalSince1970: timestamp) : nil
  }

  /// e.g. "$67,231" or "$67,231.50" depending on the currency's fraction digits.
  var formattedPrice: String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = fractionDigits
    formatter.minimumFractionDigits = fractionDigits
    let number = formatter.string(from: NSNumber(value: btcPrice)) ?? "—"
    return "\(currencySymbol)\(number)"
  }

  /// Compact form for tight complication slots, e.g. "$67.2k" or "$1.05M".
  var compactPrice: String {
    guard hasPrice else { return "—" }
    let value = btcPrice
    let (scaled, suffix): (Double, String)
    switch value {
    case 1_000_000...:
      (scaled, suffix) = (value / 1_000_000, "M")
    case 1_000...:
      (scaled, suffix) = (value / 1_000, "k")
    default:
      (scaled, suffix) = (value, "")
    }
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = suffix.isEmpty ? 0 : 1
    let number = formatter.string(from: NSNumber(value: scaled)) ?? "—"
    return "\(currencySymbol)\(number)\(suffix)"
  }
}
