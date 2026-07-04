//
//  WatchConnectivityBridge.swift
//  LNFlash
//
//  React Native native module that talks to the paired Apple Watch over
//  WatchConnectivity. Two responsibilities:
//
//   1. Push lightweight user context to the watch, including display-currency
//      preference and receive Paycode QR payload. The JS layer (app/utils/watch.ts)
//      calls sync methods when those values change.
//
//   2. Receive quick-action requests from the watch ("scan" / "receive") and
//      open the matching `flash://widget/...` deep link, reusing the app's
//      existing React Navigation linking config. iOS forbids a background app
//      from foregrounding itself, so when the app isn't active the action is
//      stashed and surfaced as a local notification; the deep link fires on
//      the next activation.
//
//  The watch fetches the BTC price itself, so this bridge is best-effort: if the
//  watch is unpaired or unreachable, currency sync simply no-ops.
//

import Foundation
import React
import WatchConnectivity
import UIKit
import CoreImage
import UserNotifications

@objc(WatchConnectivityBridge)
class WatchConnectivityBridge: NSObject {

  private static let bootstrap = WatchConnectivityBridge()

  private static var latestApplicationContext: [String: Any] = [:]

  private var session: WCSession? {
    WCSession.isSupported() ? WCSession.default : nil
  }

  override init() {
    super.init()
    if let session {
      session.delegate = self
      session.activate()
    }
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(consumePendingQuickAction),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
  }

  /// Called from AppDelegate so WatchConnectivity can wake the iOS app and
  /// receive watch quick-actions before React Native has created this module.
  @objc
  static func activateSession() {
    _ = bootstrap
  }

  /// Pushes the user's display currency to the watch via `updateApplicationContext`,
  /// which the system delivers even when the watch app is in the background.
  @objc(syncCurrency:resolver:rejecter:)
  func syncCurrency(
    _ data: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    updateWatchContext(
      [
        "currencyCode": data["currencyCode"] as? String ?? "USD",
        "currencySymbol": data["currencySymbol"] as? String ?? "$",
        "fractionDigits": (data["fractionDigits"] as? NSNumber)?.intValue ?? 2,
      ],
      resolver: resolve,
      rejecter: reject
    )
  }

  @objc(syncReceiveQRCode:resolver:rejecter:)
  func syncReceiveQRCode(
    _ data: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let qrCode = data["receiveQRCode"] as? String ?? ""
    var updates: [String: Any] = [
      "receiveQRCode": qrCode,
      "receiveAddress": data["receiveAddress"] as? String ?? "",
      "receiveLabel": data["receiveLabel"] as? String ?? "Paycode",
    ]
    if let qrCodeImage = Self.makeQRCodeImageBase64(from: qrCode) {
      updates["receiveQRCodeImage"] = qrCodeImage
    }

    updateWatchContext(
      updates,
      resolver: resolve,
      rejecter: reject
    )
  }

  private func updateWatchContext(
    _ updates: [String: Any],
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

    Self.latestApplicationContext.merge(updates) { _, new in new }

    do {
      try session.updateApplicationContext(Self.latestApplicationContext)
      resolve(nil)
    } catch {
      reject("watch_context_failed", error.localizedDescription, error)
    }
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  private static let pendingActionKey = "watchPendingQuickAction"
  private static let pendingActionTimestampKey = "watchPendingQuickActionTimestamp"
  private static let pendingActionMaxAge: TimeInterval = 300

  private func handleWatchAction(_ action: String) {
    let allowed = ["scan", "receive", "home"]
    guard allowed.contains(action), let url = Self.quickActionURL(for: action) else { return }
    DispatchQueue.main.async {
      if UIApplication.shared.applicationState == .active {
        UIApplication.shared.open(url, options: [:]) { success in
          if !success {
            NSLog("WatchConnectivityBridge: failed to open %@", url.absoluteString)
          }
        }
      } else {
        // A backgrounded app cannot foreground itself (UIApplication.open is
        // ignored), so stash the action and surface a notification. The deep
        // link fires from consumePendingQuickAction on the next activation.
        Self.storePendingAction(action)
        Self.postQuickActionNotification(for: action)
      }
    }
  }

  /// Quick-action links are namespaced under widget/ so their paths can never
  /// match the ":payment" username route in the RN linking config. "home" is
  /// deliberately unmapped there: opening the app is the whole request.
  private static func quickActionURL(for action: String) -> URL? {
    URL(string: "flash://widget/\(action)")
  }

  private static func storePendingAction(_ action: String) {
    let defaults = UserDefaults.standard
    defaults.set(action, forKey: pendingActionKey)
    defaults.set(Date().timeIntervalSince1970, forKey: pendingActionTimestampKey)
  }

  @objc
  private func consumePendingQuickAction() {
    let defaults = UserDefaults.standard
    guard let action = defaults.string(forKey: Self.pendingActionKey) else { return }
    defaults.removeObject(forKey: Self.pendingActionKey)

    let age = Date().timeIntervalSince1970
      - defaults.double(forKey: Self.pendingActionTimestampKey)
    guard age < Self.pendingActionMaxAge, action != "home",
      let url = Self.quickActionURL(for: action)
    else { return }

    UIApplication.shared.open(url, options: [:], completionHandler: nil)
  }

  private static func postQuickActionNotification(for action: String) {
    let center = UNUserNotificationCenter.current()
    center.getNotificationSettings { settings in
      guard
        settings.authorizationStatus == .authorized
          || settings.authorizationStatus == .provisional
      else { return }

      let content = UNMutableNotificationContent()
      content.title = "Flash"
      switch action {
      case "scan":
        content.body = "Tap to open the QR scanner"
      case "receive":
        content.body = "Tap to show your receive Paycode"
      default:
        content.body = "Tap to open Flash"
      }

      let request = UNNotificationRequest(
        identifier: "watch-quick-action",
        content: content,
        trigger: nil
      )
      center.add(request, withCompletionHandler: nil)
    }
  }

  private static func makeQRCodeImageBase64(from payload: String) -> String? {
    guard !payload.isEmpty else { return nil }
    let filter = CIFilter(name: "CIQRCodeGenerator")
    filter?.setValue(Data(payload.utf8), forKey: "inputMessage")
    filter?.setValue("M", forKey: "inputCorrectionLevel")
    guard let output = filter?.outputImage else { return nil }

    let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
    let context = CIContext()
    guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else {
      return nil
    }

    return UIImage(cgImage: cgImage).pngData()?.base64EncodedString()
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

  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    if let action = message["action"] as? String {
      handleWatchAction(action)
    }
    replyHandler(["received": true])
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
    if let action = userInfo["action"] as? String {
      handleWatchAction(action)
    }
  }
}
