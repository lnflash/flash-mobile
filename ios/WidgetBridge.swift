//
//  WidgetBridge.swift
//  LNFlash
//
//  React Native native module. The JS layer (app/utils/widget.ts) calls
//  `setPriceData` on every price poll so the home-screen widget can render the
//  user's display currency, then asks WidgetKit to reload its timelines.
//

import Foundation
import WidgetKit

@objc(WidgetBridge)
class WidgetBridge: NSObject {

  // Must match SharedStore.appGroupId in the widget extension.
  private let appGroupId = "group.com.lnflash"

  @objc(setPriceData:resolver:rejecter:)
  func setPriceData(
    _ data: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let defaults = UserDefaults(suiteName: appGroupId) else {
      reject("no_app_group", "App Group \(appGroupId) is not available", nil)
      return
    }

    // RN bridges JS numbers as NSNumber; extract explicitly to avoid flaky casts.
    defaults.set((data["btcPrice"] as? NSNumber)?.doubleValue ?? 0, forKey: "btcPrice")
    defaults.set(data["currencyCode"] as? String ?? "USD", forKey: "currencyCode")
    defaults.set(data["currencySymbol"] as? String ?? "$", forKey: "currencySymbol")
    defaults.set((data["fractionDigits"] as? NSNumber)?.intValue ?? 2, forKey: "fractionDigits")
    defaults.set((data["timestamp"] as? NSNumber)?.doubleValue ?? 0, forKey: "timestamp")

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
