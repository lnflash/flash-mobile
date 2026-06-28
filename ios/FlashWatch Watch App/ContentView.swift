//
//  ContentView.swift
//  FlashWatch
//
//  Main watch app surface: live BTC price, 30-day chart, price change,
//  and quick actions handed off to the paired iPhone.
//

import SwiftUI
import WatchKit

private enum WatchStyle {
  static let accent = Color(red: 0.0, green: 0.78, blue: 0.55)
  static let accentSoft = Color(red: 0.0, green: 0.78, blue: 0.55).opacity(0.15)
  static let secondary = Color.primary.opacity(0.6)
  static let muted = Color.primary.opacity(0.35)
  static let negative = Color(red: 1.0, green: 0.3, blue: 0.38)
  static let separator = Color.primary.opacity(0.08)
}

struct ContentView: View {
  @StateObject private var phone = PhoneConnectivity.shared
  @State private var snapshot = WatchStore.read()
  @State private var history = WatchStore.readHistory()
  @State private var receiveQRCode = WatchStore.readReceiveQRCode()
  @State private var isShowingReceiveQRCode = false
  @State private var isRefreshing = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 10) {
        header
        heroPrice
        priceChangeBadge
        chart
        metaRow
        actions
      }
      .padding(.horizontal, 4)
      .padding(.vertical, 6)
    }
    .task {
      phone.activate()
      await refreshAll()
    }
    .onChange(of: phone.currencyRevision) { _ in
      snapshot = WatchStore.read()
      history = WatchStore.readHistory()
      receiveQRCode = WatchStore.readReceiveQRCode()
      Task { await refreshAll() }
    }
    .refreshable {
      await refreshAll()
    }
    .sheet(isPresented: $isShowingReceiveQRCode) {
      if let receiveQRCode {
        ReceiveQRCodeSheet(receiveQRCode: receiveQRCode)
      }
    }
  }

  // MARK: - Header

  private var header: some View {
    HStack(alignment: .center, spacing: 6) {
      Image("FlashLogo")
        .resizable()
        .scaledToFit()
        .frame(width: 22, height: 22)

      Spacer(minLength: 4)

      if isRefreshing {
        ProgressView()
          .controlSize(.mini)
      }
    }
  }

  // MARK: - Hero price

  private var heroPrice: some View {
    Text(snapshot.hasPrice ? snapshot.formattedPrice : "Loading...")
      .font(.system(size: 36, weight: .bold, design: .rounded))
      .monospacedDigit()
      .lineLimit(1)
      .minimumScaleFactor(0.34)
      .allowsTightening(true)
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: - Price change badge

  private var priceChangeBadge: some View {
    Group {
      if let change = priceChange {
        HStack(spacing: 4) {
          Image(systemName: change.isPositive ? "arrow.up.right" : "arrow.down.right")
            .font(.system(size: 9, weight: .bold))
          Text(change.label)
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .monospacedDigit()
        }
        .foregroundStyle(change.isPositive ? WatchStyle.accent : WatchStyle.negative)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background((change.isPositive ? WatchStyle.accent : WatchStyle.negative).opacity(0.15))
        .clipShape(Capsule())
      }
    }
  }

  // MARK: - Chart

  private var chart: some View {
    VStack(spacing: 2) {
      PriceSparkline(points: history)
        .padding(.horizontal, -6)

      // High/Low row
      if let range = priceRange {
        HStack {
          Text("L \(range.low)")
            .font(.system(size: 9, weight: .medium, design: .rounded))
            .foregroundStyle(WatchStyle.muted)
            .monospacedDigit()
          Spacer()
          Text("30D")
            .font(.system(size: 9, weight: .semibold, design: .rounded))
            .foregroundStyle(WatchStyle.muted)
          Spacer()
          Text("H \(range.high)")
            .font(.system(size: 9, weight: .medium, design: .rounded))
            .foregroundStyle(WatchStyle.muted)
            .monospacedDigit()
        }
      }
    }
  }

  // MARK: - Meta row

  private var metaRow: some View {
    Text(updatedText)
      .font(.system(size: 10, weight: .medium, design: .rounded))
      .foregroundStyle(WatchStyle.secondary)
      .lineLimit(1)
      .minimumScaleFactor(0.7)
  }

  // MARK: - Actions

  private var actions: some View {
    HStack(spacing: 8) {
      QuickActionButton(title: "Scan", systemImage: "qrcode.viewfinder") {
        phone.requestQuickAction("scan")
      }
      QuickActionButton(title: "Receive", systemImage: "qrcode") {
        if let latest = WatchStore.readReceiveQRCode() {
          receiveQRCode = latest
          isShowingReceiveQRCode = true
        } else {
          phone.requestQuickAction("receive")
        }
      }
    }
  }

  // MARK: - Computed

  private var updatedText: String {
    guard let updatedAt = snapshot.updatedAt else {
      return "auto refresh"
    }
    return "Updated " + updatedAt.formatted(.relative(presentation: .named))
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
      label: "\(sign)\(String(format: "%.1f", abs(percent)))%",
      isPositive: percent >= 0
    )
  }

  private var priceRange: (low: String, high: String)? {
    let validPrices = history.filter { $0.price.isFinite && $0.price > 0 }.map { $0.price }
    guard let minP = validPrices.min(), let maxP = validPrices.max(), minP > 0 else {
      return nil
    }
    let fmt = NumberFormatter()
    fmt.numberStyle = .decimal
    fmt.maximumFractionDigits = 0
    let low = fmt.string(from: NSNumber(value: minP)) ?? "—"
    let high = fmt.string(from: NSNumber(value: maxP)) ?? "—"
    return (low, high)
  }

  // MARK: - Refresh

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

// MARK: - Receive QR

private struct ReceiveQRCodeSheet: View {
  let receiveQRCode: ReceiveQRCode

  var body: some View {
    ScrollView {
      VStack(spacing: 8) {
        Text("Receive")
          .font(.system(size: 15, weight: .bold, design: .rounded))

        QRCodeImage(imageBase64: receiveQRCode.qrCodeImage)
          .frame(maxWidth: .infinity)

        if !receiveQRCode.address.isEmpty {
          Text(receiveQRCode.address)
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .minimumScaleFactor(0.7)
        }

        Text(receiveQRCode.label)
          .font(.system(size: 10, weight: .medium, design: .rounded))
          .foregroundStyle(WatchStyle.secondary)
      }
      .padding(.horizontal, 6)
      .padding(.vertical, 8)
    }
  }
}

private struct QRCodeImage: View {
  let imageBase64: String

  var body: some View {
    Group {
      if
        let data = Data(base64Encoded: imageBase64),
        let image = UIImage(data: data)
      {
        Image(uiImage: image)
          .resizable()
          .interpolation(.none)
          .scaledToFit()
      } else {
        Image(systemName: "qrcode")
          .font(.system(size: 72, weight: .regular))
          .foregroundStyle(WatchStyle.muted)
      }
    }
    .padding(8)
    .background(Color.white)
    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
  }
}

// MARK: - Models

private struct PriceChange {
  let label: String
  let isPositive: Bool
}

// MARK: - Quick action button

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
      .padding(.vertical, 9)
    }
    .buttonStyle(.plain)
    .foregroundStyle(WatchStyle.accent)
    .background(WatchStyle.accentSoft)
    .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
  }
}

// MARK: - Sparkline chart

private struct PriceSparkline: View {
  let points: [PricePoint]

  var body: some View {
    GeometryReader { proxy in
      ChartCanvas(points: normalizedPoints(in: proxy.size))
    }
    .frame(height: 80)
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

    let topInset: CGFloat = 5
    let bottomInset: CGFloat = 5
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
                WatchStyle.accent.opacity(0.25),
                WatchStyle.accent.opacity(0.02),
              ],
              startPoint: .top,
              endPoint: .bottom
            )
          )

        SmoothLineShape(points: points)
          .stroke(
            WatchStyle.accent,
            style: StrokeStyle(lineWidth: 2.4, lineCap: .round, lineJoin: .round)
          )
      } else {
        RoundedRectangle(cornerRadius: 1)
          .fill(WatchStyle.muted)
          .frame(height: 1)
          .padding(.horizontal, 8)
      }
    }
  }
}

private struct SmoothLineShape: Shape {
  let points: [CGPoint]
  func path(in rect: CGRect) -> Path { SmoothPath.line(points) }
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
