//
//  FlashWidgetEntryView.swift
//  FlashWidget
//
//  SwiftUI views for the small / medium / large widget families.
//

import WidgetKit
import SwiftUI

enum DeepLink {
  // These map to the React Navigation linking config (see
  // app/navigation/navigation-container-wrapper.tsx).
  static let scan = URL(string: "flash://scan")!
  static let receive = URL(string: "flash://receive")!
  static let open = URL(string: "flash://home")!
}

enum FlashStyle {
  static let accent = Color(red: 0.0, green: 0.78, blue: 0.55) // Flash green
  static let secondary = Color.primary.opacity(0.6)
}

struct FlashWidgetEntryView: View {
  var entry: PriceEntry
  @Environment(\.widgetFamily) var family

  var body: some View {
    switch family {
    case .systemSmall:
      SmallView(snapshot: entry.snapshot)
    case .systemLarge:
      LargeView(snapshot: entry.snapshot)
    default:
      MediumView(snapshot: entry.snapshot)
    }
  }
}

// MARK: - Price label

private struct PriceLabel: View {
  let snapshot: PriceSnapshot
  var alignment: HorizontalAlignment = .leading

  var body: some View {
    VStack(alignment: alignment, spacing: 2) {
      HStack(spacing: 4) {
        Image(systemName: "bitcoinsign.circle.fill")
          .foregroundColor(FlashStyle.accent)
        Text("BTC")
          .font(.caption).fontWeight(.semibold)
          .foregroundColor(FlashStyle.secondary)
      }
      Text(snapshot.hasPrice ? snapshot.formattedPrice : "—")
        .font(.system(size: 22, weight: .bold, design: .rounded))
        .minimumScaleFactor(0.6)
        .lineLimit(1)
      Text(snapshot.currencyCode)
        .font(.caption2)
        .foregroundColor(FlashStyle.secondary)
    }
  }
}

// MARK: - Quick action button

private struct ActionButton: View {
  let title: String
  let systemImage: String
  let url: URL

  var body: some View {
    Link(destination: url) {
      VStack(spacing: 4) {
        Image(systemName: systemImage)
          .font(.system(size: 18, weight: .semibold))
        Text(title)
          .font(.caption2).fontWeight(.semibold)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 10)
      .background(FlashStyle.accent.opacity(0.15))
      .foregroundColor(FlashStyle.accent)
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
  }
}

// MARK: - Families

private struct SmallView: View {
  let snapshot: PriceSnapshot
  var body: some View {
    VStack(alignment: .leading) {
      PriceLabel(snapshot: snapshot)
      Spacer()
      Text("Flash")
        .font(.caption2).fontWeight(.bold)
        .foregroundColor(FlashStyle.accent)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding()
    .widgetURL(DeepLink.open)
  }
}

private struct MediumView: View {
  let snapshot: PriceSnapshot
  var body: some View {
    HStack(spacing: 16) {
      PriceLabel(snapshot: snapshot)
        .frame(maxWidth: .infinity, alignment: .leading)
      VStack(spacing: 8) {
        ActionButton(title: "Scan", systemImage: "qrcode.viewfinder", url: DeepLink.scan)
        ActionButton(title: "Receive", systemImage: "qrcode", url: DeepLink.receive)
      }
      .frame(width: 110)
    }
    .padding()
  }
}

private struct LargeView: View {
  let snapshot: PriceSnapshot
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        PriceLabel(snapshot: snapshot)
        Spacer()
        Text("Flash")
          .font(.headline).fontWeight(.bold)
          .foregroundColor(FlashStyle.accent)
      }
      Spacer()
      HStack(spacing: 12) {
        ActionButton(title: "Scan QR", systemImage: "qrcode.viewfinder", url: DeepLink.scan)
        ActionButton(title: "Receive", systemImage: "qrcode", url: DeepLink.receive)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding()
  }
}
