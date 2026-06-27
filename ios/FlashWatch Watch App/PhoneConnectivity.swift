//
//  PhoneConnectivity.swift
//  FlashWatch
//
//  Watch-side WatchConnectivity session. Two jobs:
//
//   1. Receive the user's display-currency preference from the paired iPhone
//      (pushed via `updateApplicationContext` by WatchConnectivityBridge on the
//      app side). This is best-effort personalization: the watch works fine on
//      its own (USD) until the phone delivers the preference.
//
//   2. Send quick-action requests ("scan" / "receive") to the iPhone so it can
//      open the matching screen via its existing `flash://` deep links.
//
//  The watch never needs the phone to be reachable to show a price — it fetches
//  that itself. Connectivity is purely for currency sync + handing actions off.
//

import Foundation
import WatchConnectivity

final class PhoneConnectivity: NSObject, ObservableObject {
  static let shared = PhoneConnectivity()

  /// Bumped whenever the currency changes so SwiftUI can re-fetch the price.
  @Published private(set) var currencyRevision: Int = 0

  private var session: WCSession? {
    WCSession.isSupported() ? WCSession.default : nil
  }

  func activate() {
    guard let session else { return }
    session.delegate = self
    session.activate()
  }

  /// Ask the iPhone to open one of its deep-linked screens. No-op if the phone
  /// isn't reachable; the user can always open the app on the phone manually.
  func requestQuickAction(_ action: String) {
    guard let session, session.isReachable else { return }
    session.sendMessage(["action": action], replyHandler: nil, errorHandler: nil)
  }

  private func applyContext(_ context: [String: Any]) {
    guard
      let code = context["currencyCode"] as? String,
      let symbol = context["currencySymbol"] as? String
    else { return }
    let fractionDigits = (context["fractionDigits"] as? NSNumber)?.intValue ?? 2

    let previous = WatchStore.read()
    guard
      previous.currencyCode != code
        || previous.currencySymbol != symbol
        || previous.fractionDigits != fractionDigits
    else { return }

    WatchStore.writeCurrency(code: code, symbol: symbol, fractionDigits: fractionDigits)
    DispatchQueue.main.async { self.currencyRevision += 1 }
  }
}

extension PhoneConnectivity: WCSessionDelegate {
  func session(
    _ session: WCSession,
    activationDidCompleteWith state: WCSessionActivationState,
    error: Error?
  ) {
    // The phone may have delivered the latest currency while we were inactive.
    if !session.receivedApplicationContext.isEmpty {
      applyContext(session.receivedApplicationContext)
    }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    applyContext(applicationContext)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    if message["currencyCode"] != nil {
      applyContext(message)
    }
  }
}
