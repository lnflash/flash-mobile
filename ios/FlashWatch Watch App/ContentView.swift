//
//  ContentView.swift
//  FlashWatch
//
//  Main watch app surface: live BTC price, one-month chart, self-refresh, and
//  quick actions handed off to the paired iPhone.
//

import SwiftUI

private enum WatchStyle {
  static let accent = Color(red: 0.0, green: 0.78, blue: 0.55)
  static let secondary = Color.primary.opacity(0.64)
  static let tertiary = Color.primary.opacity(0.28)
  static let negative = Color(red: 1.0, green: 0.3, blue: 0.38)
}

struct ContentView: View {
  @StateObject private var phone = PhoneConnectivity.shared
  @State private var snapshot = WatchStore.read()
  @State private var history = WatchStore.readHistory()
  @State private var isRefreshing = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 11) {
        header
        heroPrice
        PriceSparkline(points: history)
        metaRow
        actions
      }
      .padding(.horizontal, 3)
      .padding(.vertical, 8)
    }
    .task {
      phone.activate()
      await refreshAll()
    }
    .onChange(of: phone.currencyRevision) { _ in
      snapshot = WatchStore.read()
      history = WatchStore.readHistory()
      Task { await refreshAll() }
    }
    .refreshable {
      await refreshAll()
    }
  }

  private var header: some View {
    HStack(alignment: .center, spacing: 8) {
      VStack(alignment: .leading, spacing: 1) {
        Text("BTC")
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(WatchStyle.secondary)
        Text(snapshot.currencyCode)
          .font(.system(size: 10, weight: .medium, design: .rounded))
          .foregroundStyle(WatchStyle.secondary)
      }

      Spacer(minLength: 4)

      if isRefreshing {
        ProgressView()
          .controlSize(.mini)
      }

      ZStack {
        Circle()
          .fill(WatchStyle.accent.opacity(0.18))
        Image(systemName: "bolt.fill")
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(WatchStyle.accent)
      }
      .frame(width: 28, height: 28)
    }
  }

  private var heroPrice: some View {
    Text(snapshot.hasPrice ? snapshot.formattedPrice : "Loading...")
      .font(.system(size: 35, weight: .bold, design: .rounded))
      .monospacedDigit()
      .lineLimit(1)
      .minimumScaleFactor(0.34)
      .allowsTightening(true)
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var metaRow: some View {
    HStack(spacing: 7) {
      if let change = priceChange {
        HStack(spacing: 3) {
          Image(systemName: change.isPositive ? "arrow.up.right" : "arrow.down.right")
            .font(.system(size: 9, weight: .bold))
          Text(change.label)
            .font(.system(size: 10, weight: .semibold, design: .rounded))
            .monospacedDigit()
        }
        .foregroundStyle(change.isPositive ? WatchStyle.accent : WatchStyle.negative)
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background((change.isPositive ? WatchStyle.accent : WatchStyle.negative).opacity(0.15))
        .clipShape(Capsule())
      }

      Spacer(minLength: 4)

      Text(updatedText)
        .font(.system(size: 10, weight: .medium, design: .rounded))
        .foregroundStyle(WatchStyle.secondary)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
  }

  private var actions: some View {
    HStack(spacing: 8) {
      QuickActionButton(title: "Scan", systemImage: "qrcode.viewfinder") {
        phone.requestQuickAction("scan")
      }
      QuickActionButton(title: "Receive", systemImage: "qrcode") {
        phone.requestQuickAction("receive")
      }
    }
  }

  private var updatedText: String {
    guard let updatedAt = snapshot.updatedAt else {
      return "auto refresh"
    }
    return updatedAt.formatted(.relative(presentation: .named))
  }

  private var priceChange: PriceChange? {
    let validPoints = history.filter { $0.price.isFinite && $0.price > 0 }
    guard
      let first = validPoints.first?.price,
      let last = validPoints.last?.price,
      first > 0
    else {
      return nil
    }

    let percent = ((last / first) - 1) * 100
    let sign = percent >= 0 ? "+" : "-"
    return PriceChange(
      label: "30D \(sign)\(String(format: "%.1f", abs(percent)))%",
      isPositive: percent >= 0
    )
  }

  @MainActor
  private func refreshAll() async {
    guard !isRefreshing else { return }
    isRefreshing = true
    defer { isRefreshing = false }

    let previous = WatchStore.read()
    snapshot = await PriceService.fetch(previous: previous)

    let fetchedHistory = await PriceService.fetchHistory()
    history = fetchedHistory.isEmpty ? WatchStore.readHistory() : fetchedHistory
  }
}

private struct PriceChange {
  let label: String
  let isPositive: Bool
}

private struct QuickActionButton: View {
  let title: String
  let systemImage: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 5) {
        Image(systemName: systemImage)
          .font(.system(size: 13, weight: .semibold))
        Text(title)
          .font(.system(size: 11, weight: .semibold, design: .rounded))
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 8)
    }
    .buttonStyle(.plain)
    .foregroundStyle(WatchStyle.accent)
    .background(WatchStyle.accent.opacity(0.15))
    .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
  }
}

private struct PriceSparkline: View {
  let points: [PricePoint]

  var body: some View {
    GeometryReader { proxy in
      ChartCanvas(points: normalizedPoints(in: proxy.size))
    }
    .frame(height: 74)
    .padding(.horizontal, -5)
    .accessibilityHidden(true)
  }

  private func normalizedPoints(in size: CGSize) -> [CGPoint] {
    let validPoints = points.filter { $0.price.isFinite && $0.price > 0 }
    guard validPoints.count > 1, size.width > 0, size.height > 0 else {
      return []
    }

    let prices = validPoints.map(\.price)
    guard let minPrice = prices.min(), let maxPrice = prices.max() else {
      return []
    }

    let topInset: CGFloat = 6
    let bottomInset: CGFloat = 8
    let drawableHeight = max(size.height - topInset - bottomInset, 1)
    let range = max(maxPrice - minPrice, maxPrice * 0.004)
    let lastIndex = validPoints.count - 1

    return validPoints.enumerated().map { index, point in
      let x = CGFloat(index) / CGFloat(lastIndex) * size.width
      let normalized = (point.price - minPrice) / range
      let y = topInset + CGFloat(1 - normalized) * drawableHeight
      return CGPoint(x: x, y: y)
    }
  }
}

private struct ChartCanvas: View {
  let points: [CGPoint]

  var body: some View {
    ZStack {
      if points.count > 1 {
        AreaShape(points: points)
          .fill(
            LinearGradient(
              colors: [
                WatchStyle.accent.opacity(0.24),
                WatchStyle.accent.opacity(0.02),
              ],
              startPoint: .top,
              endPoint: .bottom
            )
          )

        SmoothLineShape(points: points)
          .stroke(
            WatchStyle.accent,
            style: StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round)
          )
      } else {
        RoundedRectangle(cornerRadius: 1)
          .fill(WatchStyle.tertiary)
          .frame(height: 1)
          .padding(.horizontal, 8)
      }
    }
  }
}

private struct SmoothLineShape: Shape {
  let points: [CGPoint]

  func path(in rect: CGRect) -> Path {
    SmoothPath.line(points)
  }
}

private struct AreaShape: Shape {
  let points: [CGPoint]

  func path(in rect: CGRect) -> Path {
    guard let first = points.first, let last = points.last else {
      return Path()
    }

    var path = SmoothPath.line(points)
    path.addLine(to: CGPoint(x: last.x, y: rect.maxY))
    path.addLine(to: CGPoint(x: first.x, y: rect.maxY))
    path.closeSubpath()
    return path
  }
}

private enum SmoothPath {
  static func line(_ points: [CGPoint]) -> Path {
    var path = Path()
    guard let first = points.first else { return path }

    path.move(to: first)
    guard points.count > 1 else { return path }

    if points.count == 2 {
      path.addLine(to: points[1])
      return path
    }

    for index in 0..<(points.count - 1) {
      let p0 = points[max(index - 1, 0)]
      let p1 = points[index]
      let p2 = points[index + 1]
      let p3 = points[min(index + 2, points.count - 1)]

      let control1 = CGPoint(
        x: p1.x + (p2.x - p0.x) / 6,
        y: p1.y + (p2.y - p0.y) / 6
      )
      let control2 = CGPoint(
        x: p2.x - (p3.x - p1.x) / 6,
        y: p2.y - (p3.y - p1.y) / 6
      )

      path.addCurve(to: p2, control1: control1, control2: control2)
    }

    return path
  }
}

#Preview {
  ContentView()
}
