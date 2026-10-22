import Foundation
import CryptoKit
import FlashSpeech

/// Optional generic model assets. Never accepts filenames or manifests from the network.
final class SpeechPack: NSObject, URLSessionDownloadDelegate {
  struct Asset { let name: String; let bytes: Int64; let sha: String }
  static let version = "kokoro-en-v1"
  static let assets: [Asset] = {
    let data = FlashSpeech.packManifest().data(using: .utf8)!
    let json = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
    return (json["files"] as! [[String: Any]]).map { Asset(name: $0["name"] as! String, bytes: ($0["bytes"] as! NSNumber).int64Value, sha: $0["sha256"] as! String) }
  }()
  static var base: URL { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("flash-voices", isDirectory: true) }
  static var root: URL { base.appendingPathComponent(version, isDirectory: true) }
  static var total: Int64 { assets.reduce(0) { $0 + $1.bytes } }
  static var installed: Bool { installed(at: root, assets: assets) }
  private static func installed(at root: URL, assets: [Asset]) -> Bool {
    guard FileManager.default.fileExists(atPath: root.appendingPathComponent("ready").path) else { return false }
    for asset in assets {
      let path = root.appendingPathComponent(asset.name).path
      guard let attributes = try? FileManager.default.attributesOfItem(atPath: path), let size = attributes[.size] as? NSNumber, size.int64Value == asset.bytes else { return false }
    }
    return true
  }
  private let storageBase: URL
  private let entries: [Asset]
  private var storageRoot: URL { storageBase.appendingPathComponent(Self.version, isDirectory: true) }
  private var byteCount: Int64 { entries.reduce(0) { $0 + $1.bytes } }
  private var isInstalled: Bool { Self.installed(at: storageRoot, assets: entries) }
  private var backgroundObserver: NSObjectProtocol?
  override convenience init() { self.init(base: Self.base, assets: Self.assets) }
  /// Explicit storage and immutable assets allow isolated native integration checks.
  init(base: URL, assets: [Asset]) {
    storageBase = base; entries = assets
    super.init()
    backgroundObserver = NotificationCenter.default.addObserver(forName: NSNotification.Name("UIApplicationDidEnterBackgroundNotification"), object: nil, queue: .main) { [weak self] _ in self?.cancel() }
    // A terminated transfer has no resumable install; only the complete root is usable.
    if let entries = try? FileManager.default.contentsOfDirectory(at: storageBase, includingPropertiesForKeys: nil) {
      let stale = entries.filter { $0.lastPathComponent.hasPrefix("staging-") }
      DispatchQueue.global(qos: .utility).async { stale.forEach { try? FileManager.default.removeItem(at: $0) } }
    }
  }
  deinit { if let observer = backgroundObserver { NotificationCenter.default.removeObserver(observer) } }
  var update: (([String: Any]) -> Void)?
  private var session: URLSession?
  private var active: UUID?
  private var staging: URL?
  private var source: URL?
  private var index = 0
  private var received: Int64 = 0
  private var failure = false
  private var completion: ((Bool) -> Void)?
  private let progressLock = NSLock()
  private var lastProgressTick: TimeInterval = 0
  private func shouldPublishProgress() -> Bool {
    progressLock.lock(); defer { progressLock.unlock() }
    let now = ProcessInfo.processInfo.systemUptime
    if now - lastProgressTick < 0.2 { return false }
    lastProgressTick = now
    return true
  }
  func state() -> [String: Any] { ["phase": active != nil ? "downloading" : isInstalled ? "ready" : failure ? "failed" : "missing", "receivedBytes": active != nil ? received : isInstalled ? byteCount : 0, "totalBytes": byteCount] }
  private func publish() { update?(state()) }
  func download(_ url: String, done: @escaping (Bool) -> Void) {
    guard active == nil, let remote = URL(string: url), remote.host != nil, remote.query == nil, remote.fragment == nil, remote.user == nil else { done(false); return }
    #if DEBUG
    guard remote.scheme == "https" || remote.scheme == "http" else { done(false); return }
    #else
    guard remote.scheme == "https" else { done(false); return }
    #endif
    if isInstalled { done(true); return }
    do {
      var base = storageBase
      try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
      let values = try base.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
      guard (values.volumeAvailableCapacityForImportantUsage ?? 0) >= byteCount * 2 else { throw NSError(domain: "SpeechPack", code: 3) }
      var resource = URLResourceValues(); resource.isExcludedFromBackup = true; try base.setResourceValues(resource)
      let id = UUID(); let temporary = base.appendingPathComponent("staging-" + id.uuidString, isDirectory: true)
      try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
      active = id; staging = temporary; source = remote; completion = done; index = 0; received = 0; failure = false
      let config = URLSessionConfiguration.ephemeral
      config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 900
      config.requestCachePolicy = .reloadIgnoringLocalCacheData
      session = URLSession(configuration: config, delegate: self, delegateQueue: OperationQueue())
      publish(); next()
    } catch { failure = true; publish(); done(false) }
  }
  private func next() {
    guard let id = active, let source = source, let session = session else { return }
    if index == entries.count {
      do {
        guard let temporary = staging else { throw NSError(domain: "SpeechPack", code: 1) }
        try Data(Self.version.utf8).write(to: temporary.appendingPathComponent("ready"), options: .atomic)
        if FileManager.default.fileExists(atPath: storageRoot.path) { try FileManager.default.removeItem(at: storageRoot) }
        try FileManager.default.moveItem(at: temporary, to: storageRoot)
        finish(true)
      } catch { finish(false) }
      return
    }
    let task = session.downloadTask(with: source.appendingPathComponent(entries[index].name))
    task.taskDescription = id.uuidString + "|" + entries[index].name
    task.resume()
  }
  func cancel() { guard active != nil else { return }; finish(false, canceled: true) }
  func remove() throws {
    cancel()
    if FileManager.default.fileExists(atPath: storageRoot.path) { try FileManager.default.removeItem(at: storageRoot) }
    failure = false; publish()
  }
  private func finish(_ ok: Bool, canceled: Bool = false) {
    let old = session; let temporary = staging; let done = completion
    active = nil; session = nil; staging = nil; completion = nil; source = nil
    failure = !ok && !canceled; received = ok ? byteCount : 0
    old?.invalidateAndCancel()
    if let temporary = temporary { DispatchQueue.global(qos: .utility).async { try? FileManager.default.removeItem(at: temporary) } }
    publish(); done?(ok)
  }
  static func verified(_ file: URL, asset: Asset) throws -> Bool {
    let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
    guard let size = attributes[.size] as? NSNumber, size.int64Value == asset.bytes else { return false }
    let handle = try FileHandle(forReadingFrom: file); defer { try? handle.close() }
    var hash = SHA256()
    while let part = try handle.read(upToCount: 1024 * 1024), !part.isEmpty { hash.update(data: part) }
    return hash.finalize().map { String(format: "%02x", $0) }.joined() == asset.sha
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
  func urlSession(_ session: URLSession, downloadTask task: URLSessionDownloadTask, didWriteData: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    // A fast transfer can produce hundreds of callbacks per second. Keep the
    // main queue free for taps while the sheet displays download progress.
    guard shouldPublishProgress() else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self = self, let active = self.active, self.index < self.entries.count, task.taskDescription == active.uuidString + "|" + self.entries[self.index].name else { return }
      if totalBytesWritten > self.entries[self.index].bytes || (totalBytesExpectedToWrite > 0 && totalBytesExpectedToWrite != self.entries[self.index].bytes) { self.finish(false); return }
      self.received = self.entries.prefix(self.index).reduce(0) { $0 + $1.bytes } + min(totalBytesWritten, self.entries[self.index].bytes)
      self.publish()
    }
  }
  func urlSession(_ session: URLSession, downloadTask task: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    var target: URL?; var asset: Asset?; var id: UUID?
    DispatchQueue.main.sync {
      guard let active = self.active, self.index < self.entries.count, task.taskDescription == active.uuidString + "|" + self.entries[self.index].name else { return }
      id = active; asset = self.entries[self.index]; target = self.staging?.appendingPathComponent(self.entries[self.index].name)
    }
    guard let destination = target, let entry = asset, let run = id else { return }
    var valid = false
    do {
      guard (task.response as? HTTPURLResponse)?.statusCode == 200, try Self.verified(location, asset: entry) else { throw NSError(domain: "SpeechPack", code: 2) }
      try FileManager.default.moveItem(at: location, to: destination); valid = true
    } catch { valid = false }
    DispatchQueue.main.async { [weak self] in
      guard let self = self, self.active == run else { return }
      if valid { self.received = self.entries.prefix(self.index + 1).reduce(0) { $0 + $1.bytes }; self.index += 1; self.publish(); self.next() }
      else { self.finish(false) }
    }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard error != nil else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self = self, let active = self.active, task.taskDescription?.hasPrefix(active.uuidString + "|") == true else { return }
      self.finish(false)
    }
  }
}
