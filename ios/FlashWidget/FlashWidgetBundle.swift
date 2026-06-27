//
//  FlashWidgetBundle.swift
//  FlashWidget
//
//  Entry point for the WidgetKit extension.
//

import WidgetKit
import SwiftUI

@main
struct FlashWidgetBundle: WidgetBundle {
  var body: some Widget {
    FlashWidget()
  }
}

struct FlashWidget: Widget {
  let kind: String = "FlashWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      if #available(iOS 17.0, *) {
        FlashWidgetEntryView(entry: entry)
          .containerBackground(.fill.tertiary, for: .widget)
      } else {
        FlashWidgetEntryView(entry: entry)
          .padding()
          .background()
      }
    }
    .configurationDisplayName("Flash Price & Actions")
    .description("Live BTC price plus quick Scan and Receive shortcuts.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
