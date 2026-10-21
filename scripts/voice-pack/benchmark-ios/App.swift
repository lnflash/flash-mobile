// Isolated native Release benchmark; no wallet, account, microphone or network access.
import UIKit
import FlashSpeech
import Darwin

@main final class App: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  private let label = UITextView()
  private let lock = NSLock()
  private var peak: UInt64 = 0
  private var timer: DispatchSourceTimer?
  private var rows: [[String: Any]] = []
  private var renderer: FlashSpeech?
  func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    application.isIdleTimerDisabled = true
    let controller = UIViewController()
    label.frame = UIScreen.main.bounds.insetBy(dx: 20, dy: 70)
    label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    label.isEditable = false; label.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
    label.text = "Flash voice engine Release benchmark\nRunning generic fixtures. No wallet data or audio recording."
    controller.view.addSubview(label); controller.view.backgroundColor = .systemBackground
    window = UIWindow(frame: UIScreen.main.bounds); window?.rootViewController = controller; window?.makeKeyAndVisible()
    DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 1) { self.run() }
    return true
  }
  private func memory() -> UInt64 {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
    let status = withUnsafeMutablePointer(to: &info) { p in p.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) } }
    return status == KERN_SUCCESS ? info.phys_footprint : 0
  }
  private func millis(_ start: UInt64) -> Double { Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000 }
  private func run() {
    guard let pack = Bundle.main.url(forResource: "pack", withExtension: nil) else { finish(error: "Missing benchmark assets"); return }
    rows.append(["phase": "baseline", "footprintBytes": memory(), "physicalMemoryBytes": ProcessInfo.processInfo.physicalMemory,
                 "thermalState": ProcessInfo.processInfo.thermalState.rawValue, "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled])
    let sampler = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
    sampler.schedule(deadline: .now(), repeating: .milliseconds(50))
    sampler.setEventHandler { self.lock.lock(); self.peak = max(self.peak, self.memory()); self.lock.unlock() }
    timer = sampler; sampler.resume()
    renderer = FlashSpeech(root: pack.path)
    let fixtures = [
      "Hello, I'm Flash. I can help you find your way around your wallet.",
      "To receive money, open Receive and share your Flash address or a payment request.",
      "Here is an example, not your wallet balance: twelve US dollars and fifty cents, and two thousand five hundred satoshis."
    ]
    for round in 0..<3 { for voice in ["af_heart", "am_michael", "bf_emma"] {
      let done = DispatchSemaphore(value: 0)
      let start = DispatchTime.now().uptimeNanoseconds
      var first: Double = -1; var frames = 0; var chunks = 0; var failed = false
      renderer?.render(fixtures[round], voice: voice, rate: 1, onChunk: { data, _ in
        if first < 0 { first = self.millis(start) }; frames += data.count / 4; chunks += 1; return true
      }, done: { error in failed = error != nil; done.signal() })
      guard done.wait(timeout: .now() + 120) == .success, !failed else { renderer?.cancel(); finish(error: "Generation failed"); return }
      let wall = millis(start)
      rows.append(["phase": "render", "voice": voice, "round": round, "phraseId": round, "firstPcmMs": first,
                   "wallMs": wall, "audioMs": Double(frames) / 24, "chunks": chunks,
                   "realTimeFactor": wall / (Double(frames) / 24), "footprintBytes": memory(),
                   "thermalState": ProcessInfo.processInfo.thermalState.rawValue])
    } }
    renderer?.cancel(); renderer = nil
    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 2) {
      self.rows.append(["phase": "disposed", "footprintBytes": self.memory()]); self.finish(error: nil)
    }
  }
  private func finish(error: String?) {
    timer?.cancel(); timer = nil
    lock.lock(); let measuredPeak = peak; lock.unlock()
    var result: [String: Any] = ["scope": "isolated Release native engine; first PCM is not speaker latency", "peakFootprintBytes": measuredPeak, "results": rows]
    if let error = error { result["error"] = error }
    if let data = try? JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys]),
       let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
      try? data.write(to: directory.appendingPathComponent("voice-benchmark.json"), options: .atomic)
      DispatchQueue.main.async {
        UIApplication.shared.isIdleTimerDisabled = false
        self.label.text = String(data: data, encoding: .utf8)
      }
    }
  }
}
