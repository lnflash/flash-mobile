//
//  WatchConnectivityBridge.swift
//  LNFlash
//
//  React Native native module that talks to the paired Apple Watch over
//  WatchConnectivity. Two responsibilities:
//
//   1. Push the user's display-currency preference to the watch (so the watch
//      app + complication render BTC in the same currency as the phone). The JS
//      layer (app/utils/watch.ts) calls `syncCurrency` whenever the display
//      currency changes.
//
//   2. Receive quick-action requests from the watch ("scan" / "receive") and
//      open the matching `flash://` deep link, reusing the app's existing
//      React Navigation linking config.
//
//  The watch fetches the BTC price itself, so this bridge is best-effort: if the
//  watch is unpaired or unreachable, currency sync simply no-ops.
//

import Foundation
import React
import WatchConnectivity
import UIKit

@objc(WatchConnectivityBridge)
class WatchConnectivityBridge: NSObject {

  private var session: WCSession? {
    WCSession.isSupported() ? WCSession.default : nil
  }

  override init() {
    super.init()
    if let session {
      session.delegate = self
      session.activate()
    }
  }

  /// Pushes the user's display currency to the watch via `updateApplicationContext`,
  /// which the system delivers even when the watch app is in the background.
  @objc(syncCurrency:resolver:rejecter:)
  func syncCurrency(
    _ data: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let session, session.activationState == .activated else {
      // Not an error: the device may have no paired watch.
      resolve(nil)
      return
    }
    guard session.isWatchAppInstalled || session.isPaired else {
      resolve(nil)
      return
    }

    let context: [String: Any] = [
      "currencyCode": data["currencyCode"] as? String ?? "USD",
      "currencySymbol": data["currencySymbol"] as? String ?? "$",
      "fractionDigits": (data["fractionDigits"] as? NSNumber)?.intValue ?? 2,
    ]

    do {
      try session.updateApplicationContext(context)
      resolve(nil)
    } catch {
      reject("watch_context_failed", error.localizedDescription, error)
    }
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  private func handleWatchAction(_ action: String) {
    let allowed = ["scan", "receive", "home"]
    guard allowed.contains(action), let url = URL(string: "flash://\(action)") else { return }
    DispatchQueue.main.async {
      UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
  }
}

extension WatchConnectivityBridge: WCSessionDelegate {
  func session(
    _ session: WCSession,
    activationDidCompleteWith state: WCSessionActivationState,
    error: Error?
  ) {}

  // Required stubs on iOS so the session can re-activate after a watch switch.
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    if let action = message["action"] as? String {
      handleWatchAction(action)
    }
  }
}
