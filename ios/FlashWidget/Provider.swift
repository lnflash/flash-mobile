//
//  Provider.swift
//  FlashWidget
//
//  Supplies timeline entries to WidgetKit. Each refresh reads the last snapshot
//  the app wrote, then attempts a live refresh via PriceService so the widget
//  stays current even while the app is closed.
//

import WidgetKit
import SwiftUI

struct PriceEntry: TimelineEntry {
  let date: Date
  let snapshot: PriceSnapshot
}

struct Provider: TimelineProvider {
  /// Shown in the widget gallery and while real data loads.
  func placeholder(in context: Context) -> PriceEntry {
    PriceEntry(
      date: Date(),
      snapshot: PriceSnapshot(
        btcPrice: 67231,
        currencyCode: "USD",
        currencySymbol: "$",
        fractionDigits: 2,
        timestamp: Date().timeIntervalSince1970
      )
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (PriceEntry) -> Void) {
    completion(PriceEntry(date: Date(), snapshot: SharedStore.read()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<PriceEntry>) -> Void) {
    let previous = SharedStore.read()
    // Refresh roughly every 15 minutes (WidgetKit budgets these requests).
    let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)

    PriceService.fetch(
      currencyCode: previous.currencyCode,
      fractionDigits: previous.fractionDigits,
      symbol: previous.currencySymbol,
      previous: previous
    ) { snapshot in
      let entry = PriceEntry(date: Date(), snapshot: snapshot)
      completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
  }
}
