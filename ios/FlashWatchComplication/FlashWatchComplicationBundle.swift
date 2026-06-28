//
//  FlashWatchComplicationBundle.swift
//  FlashWatchComplication
//
//  Created by Dread on 6/27/26.
//  Copyright © 2026 Galoy Inc. All rights reserved.
//

import WidgetKit
import SwiftUI

@main
struct FlashWatchComplicationBundle: WidgetBundle {
  var body: some Widget {
    FlashWatchComplication()
  }
}

struct FlashWatchComplication: Widget {
  private let kind = "FlashWatchComplication"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: ComplicationProvider()) { entry in
      ComplicationEntryView(entry: entry)
        .widgetContainerBackground()
    }
    .configurationDisplayName("Flash BTC Price")
    .description("See the live BTC price from Flash.")
    .supportedFamilies([
      .accessoryInline,
      .accessoryCircular,
      .accessoryRectangular,
      .accessoryCorner,
    ])
  }
}

private extension View {
  @ViewBuilder
  func widgetContainerBackground() -> some View {
    if #available(watchOS 10.0, *) {
      self.containerBackground(.fill.tertiary, for: .widget)
    } else {
      self
    }
  }
}
