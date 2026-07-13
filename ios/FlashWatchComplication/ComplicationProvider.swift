//
//  ComplicationProvider.swift
//  FlashWatchComplication
//
//  Supplies timeline entries to WidgetKit on the watch. Each refresh reads the
//  last snapshot from the shared WatchStore, then attempts a live refresh via
//  PriceService so the complication stays current even when the watch app isn't
//  open. WidgetKit budgets watch refreshes, so we ask for one roughly every
//  20 minutes.
//

import WidgetKit
import SwiftUI

struct ComplicationEntry: TimelineEntry {
  let date: Date
  let snapshot: PriceSnapshot
}

struct ComplicationProvider: TimelineProvider {
  func placeholder(in context: Context) -> ComplicationEntry {
    ComplicationEntry(
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

  func getSnapshot(in context: Context, completion: @escaping (ComplicationEntry) -> Void) {
    completion(ComplicationEntry(date: Date(), snapshot: WatchStore.read()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<ComplicationEntry>) -> Void) {
    let previous = WatchStore.read()
    let nextRefresh =
      Calendar.current.date(byAdding: .minute, value: 20, to: Date())
      ?? Date().addingTimeInterval(1200)

    PriceService.fetch(previous: previous) { snapshot in
      let entry = ComplicationEntry(date: Date(), snapshot: snapshot)
      completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
  }
}
