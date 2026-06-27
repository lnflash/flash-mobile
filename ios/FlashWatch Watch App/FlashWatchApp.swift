//
//  FlashWatchApp.swift
//  FlashWatch
//
//  Entry point for the Flash watchOS app. Activates WatchConnectivity on launch
//  so the watch picks up the iPhone's display-currency preference, then shows
//  the live BTC price.
//

import SwiftUI

@main
struct FlashWatchApp: App {
  @WKApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}

final class AppDelegate: NSObject, WKApplicationDelegate {
  func applicationDidFinishLaunching() {
    PhoneConnectivity.shared.activate()
  }
}
