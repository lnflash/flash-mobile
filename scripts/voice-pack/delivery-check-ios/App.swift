// Uses production SpeechPack and FlashSpeech, with a separate app container.
// No account, microphone, bundled voice assets or production configuration changes.
import UIKit
import FlashSpeech

@main final class App: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  private let label = UITextView()
  private var pack: SpeechPack!
  private let source = "https://voices.flashapp.me/kokoro-en-v1"
  private var rows: [[String: Any]] = []
  private var canceled = false
  private var renderer: FlashSpeech?
  private var finished = false
  private var output = "delivery-check.json"

  func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    let controller = UIViewController()
    controller.view.backgroundColor = .systemBackground
    label.frame = UIScreen.main.bounds.insetBy(dx: 20, dy: 60)
    label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    label.isEditable = false; label.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
    label.text = "Checking public voice delivery. Generic fixtures only."
    controller.view.addSubview(label)
    window = UIWindow(frame: UIScreen.main.bounds)
    window?.rootViewController = controller; window?.makeKeyAndVisible()
    application.isIdleTimerDisabled = true
    pack = SpeechPack()
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
      if CommandLine.arguments.contains("--installed-check") {
        self.output = "delivery-reload.json"
        guard SpeechPack.installed, self.pack.state()["phase"] as? String == "ready" else { self.finish("Installed pack missing"); return }
        self.rows.append(["phase": "coldReload", "ready": true, "downloadCalled": false])
        self.renderInstalled()
      } else { self.begin() }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 900) { if !self.finished { self.pack.cancel(); self.finish("Check timed out") } }
    return true
  }

  private func begin() {
    // Never delete an existing installation implicitly, even in this separate app.
    guard !SpeechPack.installed else { finish("Use installed-check for an existing pack"); return }
    let start = ProcessInfo.processInfo.systemUptime
    pack.update = { state in
      guard !self.canceled, state["phase"] as? String == "downloading",
            (state["receivedBytes"] as? NSNumber)?.int64Value ?? 0 > 0 else { return }
      self.canceled = true
      self.pack.cancel()
    }
    pack.download(source) { ok in
      self.pack.update = nil
      guard !ok, self.canceled, self.pack.state()["phase"] as? String == "missing", !SpeechPack.installed else { self.finish("Cancellation check failed"); return }
      self.rows.append(["phase": "cancel", "wallMs": self.ms(start), "ready": false])
      self.download("retry") {
        do { try self.pack.remove() } catch { self.finish("Deletion failed"); return }
        guard !SpeechPack.installed, self.pack.state()["phase"] as? String == "missing" else { self.finish("Deleted pack still ready"); return }
        self.rows.append(["phase": "delete", "ready": false])
        self.download("redownload") { self.finish(nil) }
      }
    }
  }

  private func download(_ phase: String, next: @escaping () -> Void) {
    let start = ProcessInfo.processInfo.systemUptime
    pack.download(source) { ok in
      guard ok, SpeechPack.installed, self.pack.state()["phase"] as? String == "ready" else { self.finish(phase + " failed"); return }
      let verified = SpeechPack.assets.allSatisfy { asset in
        (try? SpeechPack.verified(SpeechPack.root.appendingPathComponent(asset.name), asset: asset)) == true
      }
      guard verified else { self.finish("Installed integrity check failed"); return }
      let excluded = (try? SpeechPack.base.resourceValues(forKeys: [.isExcludedFromBackupKey]))?.isExcludedFromBackup ?? false
      guard excluded else { self.finish("Backup exclusion missing"); return }
      self.rows.append(["phase": phase, "wallMs": self.ms(start), "bytes": SpeechPack.total,
                        "verifiedFiles": SpeechPack.assets.count, "excludedFromBackup": excluded, "ready": true])
      next()
    }
  }

  // This cold-launch path never calls download or creates a URLSession.
  // Network remains available on Simulator; this is local-only acceptance,
  // not a claim that the simulator's network interfaces were disabled.
  private func renderInstalled() {
    renderer = FlashSpeech(root: SpeechPack.root.path)
    render(0)
  }
  private func render(_ index: Int) {
    let voices = ["af_heart", "am_michael", "bf_emma"]
    guard index < voices.count else { renderer?.cancel(); renderer = nil; finish(nil); return }
    let start = ProcessInfo.processInfo.systemUptime
    var first: Double?; var frames = 0
    renderer?.render("Hello, I'm Flash. I can help you find your way around your wallet.", voice: voices[index], rate: 1, onChunk: { data, _ in
      if first == nil { first = self.ms(start) }
      frames += data.count / 4
      return true
    }, done: { error in
      DispatchQueue.main.async {
        guard error == nil, first != nil, frames > 0 else { self.finish("Local synthesis failed"); return }
        self.rows.append(["phase": "localRender", "voice": voices[index], "firstPcmMs": first!,
                          "wallMs": self.ms(start), "audioFrames": frames, "downloadCalled": false])
        self.render(index + 1)
      }
    })
  }
  private func ms(_ start: TimeInterval) -> Double { (ProcessInfo.processInfo.systemUptime - start) * 1000 }
  private func finish(_ error: String?) {
    guard !finished else { return }; finished = true
    UIApplication.shared.isIdleTimerDisabled = false
    var result: [String: Any] = ["passed": error == nil, "results": rows, "systemVersion": UIDevice.current.systemVersion,
                               "scope": "Isolated iOS native public downloader and cold local synthesis; no Flash account or speaker-latency measurement"]
    if let error = error { result["error"] = error }
    guard let data = try? JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys]),
          let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
    try? data.write(to: directory.appendingPathComponent(output), options: .atomic)
    label.text = String(data: data, encoding: .utf8)
  }
}
