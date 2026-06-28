//
//  FlashWidget.swift
//  FlashWidget
//
//  Widget configuration — ties the TimelineProvider (Provider) to the SwiftUI
//  views (FlashWidgetEntryView) for all three widget families.
//

import WidgetKit
import SwiftUI

struct FlashWidget: Widget {
  let kind: String = "FlashWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      FlashWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("BTC Price")
    .description("Current Bitcoin price from Flash.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
