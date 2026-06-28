//
//  FlashWidgetEntryView.swift
//  FlashWidget
//
//  SwiftUI views for small / medium / large widget families.
//  Clean two-zone design: hero price on top, smooth sparkline below.
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

// MARK: - Logo only

struct FlashLogo: View {
  var size: CGFloat = 22

  var body: some View {
    Image("FlashLogo")
      .resizable()
      .scaledToFit()
      .frame(width: size, height: size)
  }
}

// MARK: - Smooth sparkline (Catmull-Rom → Bezier curves)

struct Sparkline: View {
  let points: [PricePoint]
  var color: Color = FlashDesign.accent
  var height: CGFloat = 40
  var lineWidth: CGFloat = 2.5
  var fillOpacity: Double = 0.22

  var body: some View {
    GeometryReader { geo in
      if points.count >= 2 {
        let path = SmoothPath.build(points: points, size: geo.size)
        ZStack {
          // Gradient fill
          fillPath(path, in: geo.size)
            .fill(
              LinearGradient(
                colors: [color.opacity(fillOpacity), color.opacity(0)],
                startPoint: .top,
                endPoint: .bottom
              )
            )
          // Smooth line
          path.stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
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
}

/// Builds a smooth curved Path from price points using Catmull-Rom spline
/// interpolation (visually similar to monotoneX / d3.curveMonotoneX).
enum SmoothPath {
  static func build(points: [PricePoint], size: CGSize) -> Path {
    guard points.count >= 2 else { return Path() }

    let (minP, maxP) = bounds(points)
    let range = max(maxP - minP, 0.0001)
    let vPad: CGFloat = 4
    let hPad: CGFloat = 1
    let usableH = size.height - vPad * 2
    let usableW = size.width - hPad * 2
    let timestamps = points.map { $0.timestamp }
    let minT = timestamps.min() ?? 0
    let maxT = timestamps.max() ?? minT
    let timeRange = max(maxT - minT, 1)

    // Convert to CGPoints
    let cgPoints: [CGPoint] = points.map { point in
      let x = hPad + usableW * CGFloat((point.timestamp - minT) / timeRange)
      let normalized = (point.price - minP) / range
      let y = vPad + usableH * (1 - CGFloat(normalized))
      return CGPoint(x: x, y: y)
    }

    return catmullRom(cgPoints)
  }

  /// Catmull-Rom spline → Bezier path for smooth curves through all points.
  private static func catmullRom(_ points: [CGPoint]) -> Path {
    var path = Path()
    guard let first = points.first else { return path }
    path.move(to: first)

    for i in 0..<points.count - 1 {
      let p0 = i == 0 ? points[0] : points[i - 1]
      let p1 = points[i]
      let p2 = points[i + 1]
      let p3 = i + 2 < points.count ? points[i + 2] : points[i + 1]

      // Catmull-Rom to Bezier conversion
      let cp1 = CGPoint(
        x: p1.x + (p2.x - p0.x) / 6,
        y: p1.y + (p2.y - p0.y) / 6
      )
      let cp2 = CGPoint(
        x: p2.x - (p3.x - p1.x) / 6,
        y: p2.y - (p3.y - p1.y) / 6
      )

      path.addCurve(to: p2, control1: cp1, control2: cp2)
    }

    return path
  }

  private static func bounds(_ points: [PricePoint]) -> (min: Double, max: Double) {
    let prices = points.map { $0.price }
    let minPrice = prices.min() ?? 0
    let maxPrice = prices.max() ?? 0
    let pad = max((maxPrice - minPrice) * 0.06, maxPrice * 0.002)
    return (minPrice - pad, maxPrice + pad)
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
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .top) {
        HeroPrice(snapshot: snapshot, size: 23)
        Spacer()
        FlashLogo(size: 23)
      }

      Spacer()

      Sparkline(points: history, height: 68, lineWidth: 2.5, fillOpacity: 0.18)
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
      VStack(alignment: .leading, spacing: 6) {
        HStack {
          HeroPrice(snapshot: snapshot, size: 26)
          Spacer()
          FlashLogo(size: 24)
        }
        Spacer()
        Sparkline(points: history, height: 58, lineWidth: 2.6, fillOpacity: 0.18)
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
    VStack(alignment: .leading, spacing: 12) {
      // Header
      HStack(alignment: .top) {
        HeroPrice(snapshot: snapshot, size: 32)
        Spacer()
        FlashLogo(size: 28)
      }

      // Chart
      Sparkline(points: history, height: 150, lineWidth: 3, fillOpacity: 0.2)
        .padding(.horizontal, -16)
        .padding(.bottom, -4)

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
