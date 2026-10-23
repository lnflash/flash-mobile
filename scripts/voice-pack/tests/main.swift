import Foundation
import CryptoKit

// The real SpeechPack implementation is compiled into this executable. All I/O
// uses a unique temporary directory and loopback server; no app storage is read.
func require(_ condition: @autoclosure () -> Bool, _ message: String) {
  if !condition() { fatalError(message) }
}
func wait(_ message: String, timeout: TimeInterval = 8, until condition: () -> Bool) {
  let deadline = Date().addingTimeInterval(timeout)
  while !condition() && Date() < deadline {
    _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01))
  }
  require(condition(), "Timed out: " + message)
}
func settle(_ seconds: TimeInterval = 0.1) {
  let end = Date().addingTimeInterval(seconds)
  while Date() < end { _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01)) }
}
func sha(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
let contents = [Data(repeating: 97, count: 131072), Data("second verified asset".utf8)]
let assets = zip(["one.bin", "two.bin"], contents).map { SpeechPack.Asset(name: $0.0, bytes: Int64($0.1.count), sha: sha($0.1)) }
let base = FileManager.default.temporaryDirectory.appendingPathComponent("flash-speech-pack-tests-" + UUID().uuidString, isDirectory: true)
try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: base) }
let server = "http://127.0.0.1:" + CommandLine.arguments[1]
func make(_ name: String) -> (SpeechPack, URL) {
  let dir = base.appendingPathComponent(name, isDirectory: true)
  return (SpeechPack(base: dir, assets: assets), dir)
}
func phase(_ pack: SpeechPack) -> String { pack.state()["phase"] as! String }
func staging(_ dir: URL) -> [URL] {
  ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []).filter { $0.lastPathComponent.hasPrefix("staging-") }
}
func clean(_ dir: URL) { wait("staging cleanup") { staging(dir).isEmpty } }

// Real URLSession download, SHA verification, commit marker, reload and removal.
do {
  let (pack, dir) = make("verified")
  var result: Bool?
  var counts: [Int64] = []
  pack.update = { counts.append(($0["receivedBytes"] as! NSNumber).int64Value) }
  pack.download(server + "/good") { result = $0 }
  wait("verified installation") { result != nil }
  require(result == true && phase(pack) == "ready", "Valid pack was not installed")
  let root = dir.appendingPathComponent(SpeechPack.version)
  for (asset, data) in zip(assets, contents) {
    require((try? Data(contentsOf: root.appendingPathComponent(asset.name))) == data, "Installed bytes differ")
  }
  require((pack.state()["receivedBytes"] as! NSNumber).int64Value == assets.reduce(0) { $0 + $1.bytes }, "Wrong completed progress")
  require(counts.allSatisfy { $0 >= 0 && $0 <= assets.reduce(0) { $0 + $1.bytes } }, "Progress escaped bounds")
  let reloaded = SpeechPack(base: dir, assets: assets)
  require(phase(reloaded) == "ready", "Complete pack did not survive recreation")
  try pack.remove()
  require(phase(pack) == "missing" && !FileManager.default.fileExists(atPath: root.path), "Removal failed")
  clean(dir)
}
for mode in ["hash", "secondhash", "size", "truncated", "oversize", "redirect", "status"] {
  let (pack, dir) = make(mode)
  var calls = 0
  var result: Bool?
  pack.download(server + "/" + mode) { result = $0; calls += 1 }
  wait(mode + " rejection") { result != nil }
  require(result == false && phase(pack) == "failed", mode + " was accepted")
  settle()
  require(calls == 1, mode + " completed more than once")
  require(!FileManager.default.fileExists(atPath: dir.appendingPathComponent(SpeechPack.version).path), mode + " installed partial assets")
  clean(dir)
}

// A burst of real delegate calls must not enqueue one main-thread publication per
// chunk. Terminal cancellation and the following successful retry bypass the cap.
do {
  let (pack, dir) = make("progress-burst")
  var canceled: Bool?
  var retried: Bool?
  var progress = 0
  var phases: [String] = []
  pack.update = { state in
    let statePhase = state["phase"] as! String
    phases.append(statePhase)
    let bytes = (state["receivedBytes"] as! NSNumber).int64Value
    if statePhase == "downloading" && bytes > 0 && bytes < assets[0].bytes { progress += 1 }
  }
  pack.download(server + "/burst") { canceled = $0 }
  wait("burst transfer begins") { progress > 0 }
  let runID = staging(dir).first!.lastPathComponent.replacingOccurrences(of: "staging-", with: "")
  let callback = URLSession.shared.downloadTask(with: URL(string: server + "/good/one.bin")!)
  callback.taskDescription = runID + "|one.bin"
  let before = progress
  let started = ProcessInfo.processInfo.systemUptime
  for chunk in 1...5000 {
    pack.urlSession(.shared, downloadTask: callback, didWriteData: 1, totalBytesWritten: Int64(4096 + chunk), totalBytesExpectedToWrite: assets[0].bytes)
  }
  settle(0.05)
  // Allow the cadence boundary and a real URLSession callback during the burst.
  let limit = Int(ceil((ProcessInfo.processInfo.systemUptime - started) / 0.2)) + 2
  require(progress - before <= limit, "Delegate burst flooded progress publications")
  pack.cancel()
  require(canceled == false && phases.last == "missing", "Cancellation was delayed by progress throttling")
  pack.download(server + "/good") { retried = $0 }
  wait("burst retry installation") { retried != nil }
  require(retried == true && phases.last == "ready", "Completion was delayed by progress throttling")
  settle(1.2)
  require(phase(pack) == "ready", "Canceled burst overwrote completed retry")
  clean(dir)
}

// Cancel after transfer begins, immediately retry, and deliver old native delegate
// callbacks while the new run exists. They must not alter the retry or its files.
do {
  let (pack, dir) = make("retry")
  var canceled: Bool?
  var retried: Bool?
  var oldCalls = 0
  pack.download(server + "/slow") { canceled = $0; oldCalls += 1 }
  wait("slow transfer begins") { (pack.state()["receivedBytes"] as! NSNumber).int64Value > 0 }
  let oldID = staging(dir).first!.lastPathComponent.replacingOccurrences(of: "staging-", with: "")
  pack.cancel()
  require(canceled == false && phase(pack) == "missing", "Cancel reported failure or readiness")
  pack.download(server + "/slow") { retried = $0 }
  let stale = URLSession.shared.downloadTask(with: URL(string: server + "/good/one.bin")!)
  stale.taskDescription = oldID + "|one.bin"
  pack.urlSession(.shared, downloadTask: stale, didWriteData: 10, totalBytesWritten: Int64.max, totalBytesExpectedToWrite: Int64.max)
  pack.urlSession(.shared, task: stale, didCompleteWithError: NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled))
  // didFinish runs on URLSession's delegate queue and synchronizes with main.
  let lateFile = base.appendingPathComponent("late-old-file")
  try contents[0].write(to: lateFile)
  var lateFinished = false
  DispatchQueue.global().async {
    pack.urlSession(.shared, downloadTask: stale, didFinishDownloadingTo: lateFile)
    DispatchQueue.main.async { lateFinished = true }
  }
  wait("late callback ignored") { lateFinished }
  require(phase(pack) == "downloading", "Stale callback stopped retry")
  require(FileManager.default.fileExists(atPath: lateFile.path), "Stale completion consumed old file")
  wait("retry installation") { retried != nil }
  require(retried == true && phase(pack) == "ready" && oldCalls == 1, "Retry was corrupted by old completion")
  settle(1.2)
  require(phase(pack) == "ready" && oldCalls == 1, "Late real URLSession callbacks overwrote retry")
  clean(dir)
}

do {
  let (pack, dir) = make("background")
  var result: Bool?
  pack.download(server + "/slow") { result = $0 }
  wait("background transfer begins") { (pack.state()["receivedBytes"] as! NSNumber).int64Value > 0 }
  NotificationCenter.default.post(name: NSNotification.Name("UIApplicationDidEnterBackgroundNotification"), object: nil)
  require(result == false && phase(pack) == "missing", "Background did not cancel")
  settle(1.2)
  require(phase(pack) == "missing", "Backgrounded transfer installed later")
  clean(dir)
}

do {
  let dir = base.appendingPathComponent("startup")
  let stale = dir.appendingPathComponent("staging-abandoned")
  try FileManager.default.createDirectory(at: stale, withIntermediateDirectories: true)
  try Data("partial".utf8).write(to: stale.appendingPathComponent("one.bin"))
  let pack = SpeechPack(base: dir, assets: assets)
  require(phase(pack) == "missing", "Partial staging became installed")
  clean(dir)
  var result: Bool?
  pack.download(server + "/good") { result = $0 }
  wait("post-cleanup installation") { result != nil }
  require(result == true, "Startup cleanup affected new download")
}
print("PASS native iOS pack: verified install, corrupt/size/truncated/oversized rejection, redirects/status, bounded progress bursts, cancel/retry/stale callbacks, background, removal and cleanup")
