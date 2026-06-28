//
//  FlashWidgetEntryView.swift
//  FlashWidget
//
//  SwiftUI views for small / medium / large widget families.
//  Clean two-zone design: hero price on top, smooth sparkline below.
//  Inspired by River's polished minimal aesthetic.
//

import WidgetKit
import SwiftUI

// MARK: - Deep links

enum DeepLink {
  static let scan = URL(string: "flash://scan")!
  static let receive = URL(string: "flash://receive")!
  static let sendHome = URL(string: "flash://home")!
}

// MARK: - Design tokens

enum FlashDesign {
  static let accent = Color(red: 0.0, green: 0.78, blue: 0.55)
  static let accentSoft = Color(red: 0.0, green: 0.78, blue: 0.55).opacity(0.15)
  static let negative = Color(red: 1.0, green: 0.3, blue: 0.38)
  static let muted = Color.primary.opacity(0.5)
  static let separator = Color.primary.opacity(0.08)
}

// MARK: - Main entry view

struct FlashWidgetEntryView: View {
  var entry: PriceEntry
  @Environment(\.widgetFamily) var family

  var body: some View {
    Group {
      switch family {
      case .systemSmall:
        SmallWidget(snapshot: entry.snapshot, history: entry.history)
      case .systemLarge:
        LargeWidget(snapshot: entry.snapshot, history: entry.history)
      default:
        MediumWidget(snapshot: entry.snapshot, history: entry.history)
      }
    }
    .widgetContainerBackground()
  }
}

// MARK: - iOS 17+ container background

private extension View {
  @ViewBuilder
  func widgetContainerBackground() -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(for: .widget) { Color.clear }
    } else {
      self
    }
  }
}

// MARK: - Logo

struct FlashLogo: View {
  var size: CGFloat = 22

  var body: some View {
    Image("FlashLogo")
      .resizable()
      .scaledToFit()
      .frame(width: size, height: size)
  }
}

// MARK: - Price change computation

struct PriceChange {
  let percent: Double
  let label: String
  let isPositive: Bool
}

func computePriceChange(_ history: [PricePoint]) -> PriceChange? {
  let valid = history.filter { $0.price.isFinite && $0.price > 0 }
  guard let first = valid.first?.price, let last = valid.last?.price, first > 0 else {
    return nil
  }
  let pct = ((last / first) - 1) * 100
  let sign = pct >= 0 ? "+" : "-"
  return PriceChange(
    percent: pct,
    label: "\(sign)\(String(format: "%.1f", abs(pct)))%",
    isPositive: pct >= 0
  )
}

// MARK: - High / Low

func computeRange(_ history: [PricePoint]) -> (low: String, high: String)? {
  let prices = history.filter { $0.price.isFinite && $0.price > 0 }.map { $0.price }
  guard let minP = prices.min(), let maxP = prices.max(), minP > 0 else { return nil }
  let fmt = NumberFormatter()
  fmt.numberStyle = .decimal
  fmt.maximumFractionDigits = 0
  return (
    fmt.string(from: NSNumber(value: minP)) ?? "—",
    fmt.string(from: NSNumber(value: maxP)) ?? "—"
  )
}

// MARK: - Price change badge

struct PriceChangeBadge: View {
  let change: PriceChange

  var body: some View {
    HStack(spacing: 3) {
      Image(systemName: change.isPositive ? "arrow.up.right" : "arrow.down.right")
        .font(.system(size: 9, weight: .bold))
      Text(change.label)
        .font(.system(size: 11, weight: .semibold, design: .rounded))
        .monospacedDigit()
    }
    .foregroundColor(change.isPositive ? FlashDesign.accent : FlashDesign.negative)
  }
}

// MARK: - Smooth sparkline (Catmull-Rom → Bezier curves)

struct Sparkline: View {
  let points: [PricePoint]
  var color: Color = FlashDesign.accent
  var height: CGFloat = 40
  var lineWidth: CGFloat = 2.5
  var fillOpacity: Double = 0.22
  var showEdgeMarker: Bool = false

  var body: some View {
    GeometryReader { geo in
      if points.count >= 2 {
        let path = SmoothPath.build(points: points, size: geo.size)
        ZStack {
          fillPath(path, in: geo.size)
            .fill(
              LinearGradient(
                colors: [color.opacity(fillOpacity), color.opacity(0)],
                startPoint: .top,
                endPoint: .bottom
              )
            )
          path.stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))

          // End-point dot
          if showEdgeMarker, let last = lastPoint(in: geo.size) {
            Circle()
              .fill(color)
              .frame(width: 5, height: 5)
              .position(last)
          }
        }
      } else {
        Path { p in
          p.move(to: CGPoint(x: 0, y: geo.size.height / 2))
          p.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height / 2))
        }
        .stroke(FlashDesign.muted.opacity(0.15), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
      }
    }
    .frame(height: height)
  }

  private func fillPath(_ stroke: Path, in size: CGSize) -> Path {
    var filled = stroke
    filled.addLine(to: CGPoint(x: size.width, y: size.height))
    filled.addLine(to: CGPoint(x: 0, y: size.height))
    filled.closeSubpath()
    return filled
  }

  private func lastPoint(in size: CGSize) -> CGPoint? {
    guard !points.isEmpty else { return nil }
    let (minP, maxP) = SmoothPath.bounds(points)
    let range = max(maxP - minP, 0.0001)
    let vPad: CGFloat = 4
    let usableH = size.height - vPad * 2
    let last = points.last!
    let normalized = (last.price - minP) / range
    let y = vPad + usableH * (1 - CGFloat(normalized))
    let lastIndex = CGFloat(points.count - 1)
    let x = (lastIndex / lastIndex) * size.width
    return CGPoint(x: x - 2, y: y)
  }
}

enum SmoothPath {
  static func build(points: [PricePoint], size: CGSize) -> Path {
    guard points.count >= 2 else { return Path() }

    let (minP, maxP) = bounds(points)
    let range = max(maxP - minP, 0.0001)
    let vPad: CGFloat = 4
    let usableH = size.height - vPad * 2
    let usableW = size.width
    let lastIndex = CGFloat(points.count - 1)

    // Index-based x positioning (evenly spaced) — matches watch app chart
    let cgPoints: [CGPoint] = points.enumerated().map { index, point in
      let x = (CGFloat(index) / lastIndex) * usableW
      let normalized = (point.price - minP) / range
      let y = vPad + usableH * (1 - CGFloat(normalized))
      return CGPoint(x: x, y: y)
    }

    return catmullRom(cgPoints)
  }

  static func bounds(_ points: [PricePoint]) -> (min: Double, max: Double) {
    let prices = points.map { $0.price }
    let minPrice = prices.min() ?? 0
    let maxPrice = prices.max() ?? 0
    let pad = max((maxPrice - minPrice) * 0.06, maxPrice * 0.002)
    return (minPrice - pad, maxPrice + pad)
  }

  static func catmullRom(_ points: [CGPoint]) -> Path {
    var path = Path()
    guard let first = points.first else { return path }
    path.move(to: first)

    for i in 0..<points.count - 1 {
      let p0 = i == 0 ? points[0] : points[i - 1]
      let p1 = points[i]
      let p2 = points[i + 1]
      let p3 = i + 2 < points.count ? points[i + 2] : points[i + 1]

      let cp1 = CGPoint(x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6)
      let cp2 = CGPoint(x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6)

      path.addCurve(to: p2, control1: cp1, control2: cp2)
    }

    return path
  }
}

// MARK: - Hero price

struct HeroPrice: View {
  let snapshot: PriceSnapshot
  var size: CGFloat = 28

  var body: some View {
    Text(snapshot.hasPrice ? snapshot.formattedPrice : "—")
      .font(.system(size: size, weight: .bold, design: .rounded))
      .foregroundColor(.primary)
      .minimumScaleFactor(0.42)
      .allowsTightening(true)
      .lineLimit(1)
      .layoutPriority(1)
  }
}

// MARK: - Action chip

private struct ActionChip: View {
  let title: String
  let systemImage: String
  let url: URL

  var body: some View {
    Link(destination: url) {
      VStack(spacing: 3) {
        Image(systemName: systemImage)
          .font(.system(size: 14, weight: .semibold))
        Text(title)
          .font(.system(size: 9, weight: .semibold))
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 7)
      .background(FlashDesign.accentSoft)
      .foregroundColor(FlashDesign.accent)
      .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
  }
}

// MARK: - Small widget

private struct SmallWidget: View {
  let snapshot: PriceSnapshot
  let history: [PricePoint]

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 2) {
          HeroPrice(snapshot: snapshot, size: 22)
          if let change = computePriceChange(history) {
            PriceChangeBadge(change: change)
          }
        }
        Spacer()
        FlashLogo(size: 22)
      }

      Spacer()

      Sparkline(points: history, height: 68, lineWidth: 2.5, fillOpacity: 0.18, showEdgeMarker: true)
        .padding(.horizontal, -14)
        .padding(.bottom, -10)
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(DeepLink.sendHome)
  }
}

// MARK: - Medium widget

private struct MediumWidget: View {
  let snapshot: PriceSnapshot
  let history: [PricePoint]

  var body: some View {
    HStack(spacing: 14) {
      VStack(alignment: .leading, spacing: 4) {
        HStack {
          HeroPrice(snapshot: snapshot, size: 24)
          Spacer()
          FlashLogo(size: 22)
        }
        if let change = computePriceChange(history) {
          PriceChangeBadge(change: change)
        }
        Spacer()
        Sparkline(points: history, height: 50, lineWidth: 2.6, fillOpacity: 0.18, showEdgeMarker: true)
          .padding(.horizontal, -14)
          .padding(.bottom, -10)
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      VStack(spacing: 6) {
        ActionChip(title: "Scan", systemImage: "qrcode.viewfinder", url: DeepLink.scan)
        ActionChip(title: "Receive", systemImage: "qrcode", url: DeepLink.receive)
      }
      .frame(width: 76)
    }
    .padding(14)
  }
}

// MARK: - Large widget

private struct LargeWidget: View {
  let snapshot: PriceSnapshot
  let history: [PricePoint]

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      // Header: price + logo
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 3) {
          HeroPrice(snapshot: snapshot, size: 32)
          if let change = computePriceChange(history) {
            PriceChangeBadge(change: change)
          }
        }
        Spacer()
        FlashLogo(size: 28)
      }

      // Chart
      Sparkline(points: history, height: 130, lineWidth: 3, fillOpacity: 0.2, showEdgeMarker: true)
        .padding(.horizontal, -16)

      // High / Low row
      if let range = computeRange(history) {
        HStack {
          Text("Low \(range.low)")
            .font(.system(size: 11, weight: .medium, design: .rounded))
            .foregroundColor(FlashDesign.muted)
            .monospacedDigit()
          Spacer()
          Text("30D Range")
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .foregroundColor(FlashDesign.muted)
          Spacer()
          Text("High \(range.high)")
            .font(.system(size: 11, weight: .medium, design: .rounded))
            .foregroundColor(FlashDesign.muted)
            .monospacedDigit()
        }
      }

      Spacer()

      HStack(spacing: 8) {
        ActionChip(title: "Scan QR", systemImage: "qrcode.viewfinder", url: DeepLink.scan)
        ActionChip(title: "Receive", systemImage: "qrcode", url: DeepLink.receive)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}
