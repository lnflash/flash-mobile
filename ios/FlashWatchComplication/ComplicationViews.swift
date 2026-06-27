//
//  ComplicationViews.swift
//  FlashWatchComplication
//
//  SwiftUI views for each supported accessory family. Tapping any complication
//  launches the Flash watch app (default behaviour for accessory widgets).
//

import WidgetKit
import SwiftUI

private enum ComplicationStyle {
  static let accent = Color(red: 0.0, green: 0.78, blue: 0.55) // Flash green
}

struct ComplicationEntryView: View {
  var entry: ComplicationEntry
  @Environment(\.widgetFamily) var family

  var body: some View {
    switch family {
    case .accessoryInline:
      InlineView(snapshot: entry.snapshot)
    case .accessoryCircular:
      CircularView(snapshot: entry.snapshot)
    case .accessoryCorner:
      CornerView(snapshot: entry.snapshot)
    default:
      RectangularView(snapshot: entry.snapshot)
    }
  }
}

// MARK: - Inline (single line above/below the time)

private struct InlineView: View {
  let snapshot: PriceSnapshot
  var body: some View {
    // Inline complications render as plain text + an optional SF Symbol.
    Label("BTC \(snapshot.compactPrice)", systemImage: "bitcoinsign")
  }
}

// MARK: - Circular

private struct CircularView: View {
  let snapshot: PriceSnapshot
  var body: some View {
    VStack(spacing: 0) {
      Image(systemName: "bitcoinsign")
        .font(.system(size: 11, weight: .bold))
        .foregroundColor(ComplicationStyle.accent)
      Text(snapshot.compactPrice)
        .font(.system(size: 13, weight: .semibold, design: .rounded))
        .minimumScaleFactor(0.5)
        .lineLimit(1)
    }
    .widgetAccentable()
  }
}

// MARK: - Corner

private struct CornerView: View {
  let snapshot: PriceSnapshot
  var body: some View {
    Text(snapshot.compactPrice)
      .font(.system(size: 14, weight: .semibold, design: .rounded))
      .minimumScaleFactor(0.5)
      .widgetCurvesContent()
      .widgetLabel {
        Text("BTC")
      }
  }
}

// MARK: - Rectangular

private struct RectangularView: View {
  let snapshot: PriceSnapshot
  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "bitcoinsign.circle.fill")
        .font(.system(size: 22))
        .foregroundColor(ComplicationStyle.accent)
        .widgetAccentable()
      VStack(alignment: .leading, spacing: 1) {
        Text("Bitcoin")
          .font(.system(size: 12, weight: .semibold))
          .foregroundColor(.secondary)
        Text(snapshot.hasPrice ? snapshot.formattedPrice : "—")
          .font(.system(size: 17, weight: .bold, design: .rounded))
          .minimumScaleFactor(0.5)
          .lineLimit(1)
        Text(snapshot.currencyCode)
          .font(.system(size: 10))
          .foregroundColor(.secondary)
      }
      Spacer(minLength: 0)
    }
  }
}
