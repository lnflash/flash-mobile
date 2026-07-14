//
//  Provider.swift
//  FlashWidget
//
//  Supplies timeline entries to WidgetKit. Each refresh reads the last snapshot
//  the app wrote, refreshes 30-day history, then attempts a live price refresh.
//

import WidgetKit
import SwiftUI

struct PriceEntry: TimelineEntry {
  let date: Date
  let snapshot: PriceSnapshot
  let history: [PricePoint]
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> PriceEntry {
    PriceEntry(
      date: Date(),
      snapshot: PriceSnapshot(
        btcPrice: 67231,
        currencyCode: "USD",
        currencySymbol: "$",
        fractionDigits: 2,
        timestamp: Date().timeIntervalSince1970
      ),
      history: []
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (PriceEntry) -> Void) {
    let snapshot = SharedStore.readPrice()
    let history = SharedStore.readHistory()
    completion(PriceEntry(date: Date(), snapshot: snapshot, history: history))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<PriceEntry>) -> Void) {
    let previous = SharedStore.readPrice()
    let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)

    // Always refresh the authoritative one-month history. Older builds may
    // have cached mixed-unit data, which makes the chart and percent change
    // explode until the cache is overwritten.
    PriceService.fetchHistory { _ in
      PriceService.fetch(
        currencyCode: previous.currencyCode,
        fractionDigits: previous.fractionDigits,
        symbol: previous.currencySymbol,
        previous: previous
      ) { snapshot in
        let entry = PriceEntry(date: Date(), snapshot: snapshot, history: SharedStore.readHistory())
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
      }
    }
  }
}
