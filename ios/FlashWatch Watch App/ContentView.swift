//
//  ContentView.swift
//  FlashWatch
//
//  The watch app's single screen: a big, glanceable BTC price in the user's
//  display currency, the last-updated time, a manual refresh, and Scan/Receive
//  quick actions that hand off to the iPhone.
//

import SwiftUI

enum FlashStyle {
  static let accent = Color(red: 0.0, green: 0.78, blue: 0.55) // Flash green
  static let secondary = Color.primary.opacity(0.6)
}

struct ContentView: View {
  @ObservedObject private var connectivity = PhoneConnectivity.shared
  @State private var snapshot = WatchStore.read()
  @State private var isRefreshing = false

  var body: some View {
    ScrollView {
      VStack(spacing: 12) {
        priceCard
        actions
        footer
      }
      .padding(.horizontal, 4)
    }
    .navigationTitle("Flash")
    .task { await refresh() }
    // Re-fetch in the new currency when the phone pushes a preference change.
    .onChange(of: connectivity.currencyRevision) { _ in
      snapshot = WatchStore.read()
      Task { await refresh() }
    }
  }

  // MARK: - Sections

  private var priceCard: some View {
    VStack(spacing: 4) {
      HStack(spacing: 4) {
        Image(systemName: "bitcoinsign.circle.fill")
          .foregroundColor(FlashStyle.accent)
        Text("BTC")
          .font(.caption).fontWeight(.semibold)
          .foregroundColor(FlashStyle.secondary)
      }
      Text(snapshot.hasPrice ? snapshot.formattedPrice : "—")
        .font(.system(size: 30, weight: .bold, design: .rounded))
        .minimumScaleFactor(0.5)
        .lineLimit(1)
      Text(snapshot.currencyCode)
        .font(.caption2)
        .foregroundColor(FlashStyle.secondary)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 10)
    .background(FlashStyle.accent.opacity(0.12))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }

  private var actions: some View {
    HStack(spacing: 8) {
      QuickAction(title: "Scan", systemImage: "qrcode.viewfinder") {
        connectivity.requestQuickAction("scan")
      }
      QuickAction(title: "Receive", systemImage: "qrcode") {
        connectivity.requestQuickAction("receive")
      }
    }
  }

  private var footer: some View {
    HStack(spacing: 6) {
      if isRefreshing {
        ProgressView().scaleEffect(0.7)
      } else {
        Button {
          Task { await refresh() }
        } label: {
          Image(systemName: "arrow.clockwise")
        }
        .buttonStyle(.plain)
        .foregroundColor(FlashStyle.accent)
      }
      Text(lastUpdatedText)
        .font(.caption2)
        .foregroundColor(FlashStyle.secondary)
    }
    .padding(.top, 2)
  }

  // MARK: - Helpers

  private var lastUpdatedText: String {
    guard let date = snapshot.updatedAt else { return "Tap to refresh" }
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .short
    return "Updated \(formatter.localizedString(for: date, relativeTo: Date()))"
  }

  @MainActor
  private func refresh() async {
    guard !isRefreshing else { return }
    isRefreshing = true
    snapshot = await PriceService.fetch(previous: snapshot)
    isRefreshing = false
  }
}

private struct QuickAction: View {
  let title: String
  let systemImage: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      VStack(spacing: 4) {
        Image(systemName: systemImage)
          .font(.system(size: 18, weight: .semibold))
        Text(title)
          .font(.caption2).fontWeight(.semibold)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 8)
    }
    .buttonStyle(.plain)
    .background(FlashStyle.accent.opacity(0.15))
    .foregroundColor(FlashStyle.accent)
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

#Preview {
  ContentView()
}
