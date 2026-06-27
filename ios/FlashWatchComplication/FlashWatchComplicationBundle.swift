//
//  FlashWatchComplicationBundle.swift
//  FlashWatchComplication
//
//  Entry point for the watchOS complication, built with WidgetKit (watchOS 9+).
//  ClockKit is deprecated, so the complication is a `Widget` restricted to the
//  accessory families that render on watch faces.
//

import WidgetKit
import SwiftUI

@main
struct FlashWatchComplicationBundle: WidgetBundle {
  var body: some Widget {
    FlashPriceComplication()
  }
}

struct FlashPriceComplication: Widget {
  let kind: String = "FlashPriceComplication"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: ComplicationProvider()) { entry in
      ComplicationEntryView(entry: entry)
        .containerBackground(for: .widget) { Color.clear }
    }
    .configurationDisplayName("Flash BTC Price")
    .description("Live Bitcoin price on your watch face.")
    .supportedFamilies([
      .accessoryCircular,
      .accessoryInline,
      .accessoryRectangular,
      .accessoryCorner,
    ])
  }
}
