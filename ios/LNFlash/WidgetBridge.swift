//
//  WidgetBridge.swift
//  LNFlash
//
//  React Native native module. The JS layer (app/utils/widget.ts) calls
//  `setPriceData` on every price poll so the home-screen widget can render
//  current BTC price data.
//

import Foundation
import WidgetKit

@objc(WidgetBridge)
class WidgetBridge: NSObject {

  private let appGroupId = "group.com.lnflash"

  private var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroupId)
  }

  @objc(setPriceData:resolver:rejecter:)
  func setPriceData(
    _ data: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let d = defaults else {
      reject("no_app_group", "App Group \(appGroupId) is not available", nil)
      return
    }

    d.set((data["btcPrice"] as? NSNumber)?.doubleValue ?? 0, forKey: "btcPrice")
    d.set(data["currencyCode"] as? String ?? "USD", forKey: "currencyCode")
    d.set(data["currencySymbol"] as? String ?? "$", forKey: "currencySymbol")
    d.set((data["fractionDigits"] as? NSNumber)?.intValue ?? 2, forKey: "fractionDigits")
    d.set((data["timestamp"] as? NSNumber)?.doubleValue ?? 0, forKey: "timestamp")

    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
    resolve(nil)
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
