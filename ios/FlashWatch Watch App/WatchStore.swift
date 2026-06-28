//
//  WatchStore.swift
//  FlashWatch
//
//  Reads/writes the BTC price snapshot shared between the watch app and its
//  complication via a watch-local App Group. The watch and complication also
//  persist one-month price history for the same smooth sparkline treatment used
//  by the iOS home-screen widget.
//

import Foundation

enum WatchStore {
  static let appGroupId = "group.com.lnflash.watch"

  enum Key {
    static let btcPrice = "btcPrice"
    static let currencyCode = "currencyCode"
    static let currencySymbol = "currencySymbol"
    static let fractionDigits = "fractionDigits"
    static let timestamp = "timestamp"
    static let priceHistory = "priceHistory"
    static let receiveQRCode = "receiveQRCode"
    static let receiveQRCodeImage = "receiveQRCodeImage"
    static let receiveAddress = "receiveAddress"
    static let receiveLabel = "receiveLabel"
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

  static func readHistory() -> [PricePoint] {
    guard
      let data = defaults?.data(forKey: Key.priceHistory),
      let points = try? JSONDecoder().decode([PricePoint].self, from: data)
    else {
      return []
    }
    return points
  }

  static func writeHistory(_ points: [PricePoint]) {
    guard let data = try? JSONEncoder().encode(points) else { return }
    defaults?.set(data, forKey: Key.priceHistory)
  }

  static func appendHistory(_ snapshot: PriceSnapshot) {
    guard snapshot.hasPrice, snapshot.timestamp > 0 else { return }
    var history = readHistory()
    history.append(PricePoint(price: snapshot.btcPrice, timestamp: snapshot.timestamp))
    if history.count > 160 {
      history.removeFirst(history.count - 160)
    }
    writeHistory(history)
  }

  /// Updates only the currency fields when the phone pushes the user's display
  /// currency. Keeps the last known price until the next fetch reprices it.
  static func writeCurrency(code: String, symbol: String, fractionDigits: Int) {
    guard let d = defaults else { return }
    d.set(code, forKey: Key.currencyCode)
    d.set(symbol, forKey: Key.currencySymbol)
    d.set(fractionDigits, forKey: Key.fractionDigits)
  }

  static func readReceiveQRCode() -> ReceiveQRCode? {
    guard
      let qrCode = defaults?.string(forKey: Key.receiveQRCode),
      let qrCodeImage = defaults?.string(forKey: Key.receiveQRCodeImage),
      !qrCode.isEmpty,
      !qrCodeImage.isEmpty
    else {
      return nil
    }
    return ReceiveQRCode(
      qrCode: qrCode,
      qrCodeImage: qrCodeImage,
      address: defaults?.string(forKey: Key.receiveAddress) ?? "",
      label: defaults?.string(forKey: Key.receiveLabel) ?? "Paycode"
    )
  }

  static func writeReceiveQRCode(
    qrCode: String,
    qrCodeImage: String,
    address: String,
    label: String
  ) {
    guard let d = defaults else { return }
    d.set(qrCode, forKey: Key.receiveQRCode)
    d.set(qrCodeImage, forKey: Key.receiveQRCodeImage)
    d.set(address, forKey: Key.receiveAddress)
    d.set(label, forKey: Key.receiveLabel)
  }
}

struct PricePoint: Codable, Equatable {
  let price: Double
  let timestamp: Double
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

  var formattedPrice: String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = fractionDigits
    formatter.minimumFractionDigits = fractionDigits
    let number = formatter.string(from: NSNumber(value: btcPrice)) ?? "—"
    return "\(currencySymbol)\(number)"
  }

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

struct ReceiveQRCode: Equatable {
  let qrCode: String
  let qrCodeImage: String
  let address: String
  let label: String
}
