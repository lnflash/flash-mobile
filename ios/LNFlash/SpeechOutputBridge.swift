import AVFoundation
import React
import UIKit
import FlashSpeech

@objc(SpeechOutputBridge)
final class SpeechOutputBridge: RCTEventEmitter, AVSpeechSynthesizerDelegate, AVAudioPlayerDelegate {
  private var memoryObserver: NSObjectProtocol?
  private var renderer: FlashSpeech?
  private var neuralAudio: AVAudioEngine?
  private var neuralNode: AVAudioPlayerNode?
  private let pack = SpeechPack()
  private var sample: AVAudioPlayer?
  private var synth: AVSpeechSynthesizer?
  private var current: String?
  private var utterance: AVSpeechUtterance?
  private var observers: [NSObjectProtocol] = []
  private var observing = false
  private var stopWaiters: [(RCTPromiseResolveBlock, RCTPromiseRejectBlock)] = []
  private var deadline: DispatchWorkItem?
  private var playbackDeadline: DispatchWorkItem?
  override static func requiresMainQueueSetup() -> Bool { true }
  override var methodQueue: DispatchQueue! { DispatchQueue.main }
  override func supportedEvents() -> [String]! { ["SpeechOutputEvent", "SpeechPackEvent"] }
  override func startObserving() {
    observing = true
    pack.update = { [weak self] state in if self?.observing == true { self?.sendEvent(withName: "SpeechPackEvent", body: state) } }
  }
  override func stopObserving() {
    if !Thread.isMainThread { DispatchQueue.main.async { [weak self] in self?.stopObserving() }; return }
    observing = false; cancel()
  }

  private func voices(_ locale: String) -> [AVSpeechSynthesisVoice] {
    let language = Locale(identifier: locale).languageCode ?? "en"
    let systemDefault = AVSpeechSynthesisVoice(language: locale)?.identifier
    return AVSpeechSynthesisVoice.speechVoices().filter {
      guard $0.identifier.hasPrefix("com.apple."),
            Locale(identifier: $0.language).languageCode == language,
            !$0.identifier.lowercased().contains("personal") else { return false }
      if #available(iOS 17.0, *) {
        return !$0.voiceTraits.contains(.isNoveltyVoice) && !$0.voiceTraits.contains(.isPersonalVoice)
      }
      return !$0.identifier.lowercased().contains("novelty")
    }.sorted {
      if ($0.language == locale) != ($1.language == locale) { return $0.language == locale }
      if $0.quality != $1.quality { return $0.quality.rawValue > $1.quality.rawValue }
      if ($0.identifier == systemDefault) != ($1.identifier == systemDefault) { return $0.identifier == systemDefault }
      return $0.identifier < $1.identifier
    }
  }
  private func voice(_ locale: String, preferred: String = "") -> AVSpeechSynthesisVoice? {
    let installed = voices(locale)
    return installed.first { $0.identifier == preferred } ?? installed.first
  }
  @objc(voices:resolver:rejecter:)
  func listVoices(_ locale: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    let neural: [[String: Any]] = locale.lowercased().hasPrefix("en") && SpeechPack.installed ? [
      ["id":"flash:af_heart", "name":"Heart", "language":"en-US", "quality":3, "source":"pack"],
      ["id":"flash:am_michael", "name":"Michael", "language":"en-US", "quality":3, "source":"pack"],
      ["id":"flash:bf_emma", "name":"Emma", "language":"en-GB", "quality":3, "source":"pack"]] : []
    resolve(neural + voices(locale).map { ["id": $0.identifier, "name": $0.name, "language": $0.language, "quality": $0.quality.rawValue] as [String: Any] })
  }
  @objc(capability:resolver:rejecter:)
  func capability(_ locale: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(voice(locale) != nil || (locale.lowercased().hasPrefix("en") && SpeechPack.installed))
  }
  @objc(speak:text:locale:voiceId:rate:resolver:rejecter:)
  func speak(_ id: String, text: String, locale: String, voiceId: String, rate: Double,
             resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    if current == nil, !text.isEmpty, text.count <= 4000, UIApplication.shared.applicationState == .active,
       locale.lowercased().hasPrefix("en"), SpeechPack.installed,
       voiceId.isEmpty || voiceId.hasPrefix("flash:") {
      playNeural(id, text: text, voice: voiceId.isEmpty ? "af_heart" : String(voiceId.dropFirst(6)), rate: rate, resolve: resolve, reject: reject)
      return
    }
    guard current == nil, !text.isEmpty, text.count <= 4000,
          UIApplication.shared.applicationState == .active,
          let selected = voice(locale, preferred: voiceId) else { reject("unavailable", "Offline speech unavailable", nil); return }
    guard AssistantAudioCoordinator.shared.claim("output:\(id)") else { reject("busy", "Audio in use", nil); return }
    current = id
    do {
      let audio = AVAudioSession.sharedInstance()
      try audio.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
      try audio.setActive(true)
      let native = AVSpeechSynthesizer()
      native.delegate = self
      synth = native
      let message = AVSpeechUtterance(string: text)
      message.voice = selected
      message.rate = AVSpeechUtteranceDefaultSpeechRate * Float(min(1.2, max(0.8, rate)))
      // Give the newly activated output route time to settle before the first word.
      message.preUtteranceDelay = 0.25
      utterance = message
      let center = NotificationCenter.default
      observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
        if (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue == AVAudioSession.InterruptionType.began.rawValue { self?.cancel() }
      })
      observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
        let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? NSNumber)?.uintValue
        if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue || reason == AVAudioSession.RouteChangeReason.noSuitableRouteForCategory.rawValue { self?.cancel() }
      })
      observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.cancel() })
      native.speak(message)
      let timeout = DispatchWorkItem { [weak self] in if self?.current == id { self?.cancel() } }
      playbackDeadline = timeout
      DispatchQueue.main.asyncAfter(deadline: .now() + 120, execute: timeout)
      resolve(nil)
    } catch { finish(id, type: "error"); reject("failed", "Speech failed", nil) }
  }
  // Debug diagnostics contain resource counters only, never text or model inputs.
  @objc(speechDiagnostics:rejecter:)
  func speechDiagnostics(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    #if DEBUG
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
    let status = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) }
    }
    resolve(["footprintBytes": status == KERN_SUCCESS ? Double(info.phys_footprint) : 0, "rendererCached": renderer != nil])
    #else
    reject("unavailable", "Diagnostics unavailable", nil)
    #endif
  }
  @objc(packState:rejecter:)
  func packState(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) { resolve(pack.state()) }
  @objc(downloadPack:resolver:rejecter:)
  func downloadPack(_ source: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    pack.download(source) { [weak self] _ in resolve(self?.pack.state() ?? ["phase":"failed"]) }
  }
  @objc(cancelPack:rejecter:)
  func cancelPack(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) { pack.cancel(); resolve(pack.state()) }
  @objc(removePack:rejecter:)
  func removePack(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    cancel(); renderer = nil
    do { try pack.remove(); resolve(pack.state()) } catch { reject("failed", "Could not remove voice pack", nil) }
  }
  private func playNeural(_ id: String, text: String, voice: String, rate: Double, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guard ["af_heart","am_michael","bf_emma"].contains(voice), AssistantAudioCoordinator.shared.claim("output:\(id)") else { reject("busy", "Audio in use", nil); return }
    current = id
    do {
      let audio = AVAudioSession.sharedInstance()
      try audio.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers]); try audio.setActive(true)
      let engine = AVAudioEngine(); let player = AVAudioPlayerNode()
      guard let format = AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1) else { throw NSError(domain:"FlashSpeech", code:1) }
      engine.attach(player); engine.connect(player, to: engine.mainMixerNode, format: format)
      neuralAudio = engine; neuralNode = player
      try engine.start(); player.play()
      if renderer == nil { renderer = FlashSpeech(root: SpeechPack.root.path) }
      var started = false
      renderer?.render(text, voice: voice, rate: Float(rate), onChunk: { [weak self, weak player] data, last in
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(data.count / 4)), let channel = buffer.floatChannelData?[0] else { return false }
        buffer.frameLength = AVAudioFrameCount(data.count / 4)
        data.copyBytes(to: UnsafeMutableRawBufferPointer(start: channel, count: data.count))
        DispatchQueue.main.async {
          guard let self = self, self.current == id, self.neuralNode === player, let player = player else { return }
          if last {
            player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in DispatchQueue.main.async { if self?.current == id { self?.finish(id, type: "end") } } }
          } else { player.scheduleBuffer(buffer) }
          if !started { started = true; self.emit(id, "started") }
        }
        return true
      }, done: { [weak self] error in
        if error != nil { DispatchQueue.main.async { if self?.current == id { self?.finish(id, type: "error") } } }
      })
      let center = NotificationCenter.default
      observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
        if (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue == AVAudioSession.InterruptionType.began.rawValue { self?.cancel() }
      })
      observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
        let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? NSNumber)?.uintValue
        if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue || reason == AVAudioSession.RouteChangeReason.noSuitableRouteForCategory.rawValue { self?.cancel() }
      })
      observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.cancel() })
      if memoryObserver == nil {
        memoryObserver = center.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main) { [weak self] _ in self?.cancel(); self?.renderer = nil }
      }
      let timeout = DispatchWorkItem { [weak self] in if self?.current == id { self?.cancel() } }
      playbackDeadline = timeout; DispatchQueue.main.asyncAfter(deadline: .now() + 120, execute: timeout)
      resolve(nil)
    } catch { finish(id, type: "error"); reject("failed", "Offline speech failed", nil) }
  }
  // Debug-only audition of locally generated, generic voice samples. No model in the app.
  @objc(playSample:path:resolver:rejecter:)
  func playSample(_ id: String, path: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("flash-voice-audition/v1").resolvingSymlinksInPath().path + "/"
    let file = URL(fileURLWithPath: path).resolvingSymlinksInPath()
    guard _isDebugAssertConfiguration(), current == nil,
          UIApplication.shared.applicationState == .active,
          file.path.hasPrefix(root), file.pathExtension == "wav",
          let bytes = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize,
          bytes > 0, bytes < 5_000_000 else {
      reject("unavailable", "Sample unavailable", nil); return
    }
    guard AssistantAudioCoordinator.shared.claim("output:\(id)") else { reject("busy", "Audio in use", nil); return }
    current = id
    do {
      let audio = AVAudioSession.sharedInstance()
      try audio.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
      try audio.setActive(true)
      let player = try AVAudioPlayer(contentsOf: file)
      sample = player; player.delegate = self
      guard player.prepareToPlay(), player.play(atTime: player.deviceCurrentTime + 0.25) else { throw NSError(domain: "Sample", code: 1) }
      let center = NotificationCenter.default
      observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
        if (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue == AVAudioSession.InterruptionType.began.rawValue { self?.cancel() }
      })
      observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
        let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? NSNumber)?.uintValue
        if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue || reason == AVAudioSession.RouteChangeReason.noSuitableRouteForCategory.rawValue { self?.cancel() }
      })
      observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.cancel() })
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self, weak player] in
        if let self = self, self.current == id, self.sample === player { self.emit(id, "started") }
      }
      let timeout = DispatchWorkItem { [weak self] in if self?.current == id { self?.cancel() } }
      playbackDeadline = timeout
      DispatchQueue.main.asyncAfter(deadline: .now() + 60, execute: timeout)
      resolve(nil)
    } catch { finish(id, type: "error"); reject("failed", "Sample failed", nil) }
  }
  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    if sample === player, let id = current { finish(id, type: flag ? "end" : "error") }
  }
  func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
    if sample === player, let id = current { finish(id, type: "error") }
  }
  @objc(stop:rejecter:)
  func stop(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard current != nil else { resolve(nil); return }
    stopWaiters.append((resolve, reject))
    cancel()
  }
  @objc func dispose() { cancel(); renderer = nil }
  private func cancel() {
    guard let id = current else { return }
    if neuralAudio != nil { renderer?.cancel(); neuralNode?.stop(); neuralAudio?.stop(); finish(id, type: "end"); return }
    if let player = sample { player.stop(); finish(id, type: "end"); return }
    synth?.stopSpeaking(at: .immediate)
    if synth?.isSpeaking != true { finish(id, type: "end"); return }
    // The recorder must not start until native synthesis has really stopped.
    deadline?.cancel()
    let timeout = DispatchWorkItem { [weak self] in
      guard let self = self, self.current == id else { return }
      if self.synth?.isSpeaking != true { self.finish(id, type: "end") }
      else {
        let waiters = self.stopWaiters; self.stopWaiters = []
        waiters.forEach { $0.1("stop_timeout", "Speech did not stop", nil) }
        self.emit(id, "error") // Keep ownership until a native terminal callback.
      }
    }
    deadline = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.75, execute: timeout)
  }
  private func emit(_ id: String, _ type: String) {
    if observing { sendEvent(withName: "SpeechOutputEvent", body: ["playbackId": id, "type": type]) }
  }
  private func finish(_ id: String, type: String) {
    guard current == id else { return }
    current = nil; utterance = nil
    renderer?.cancel(); neuralNode?.stop(); neuralAudio?.stop(); neuralNode = nil; neuralAudio = nil
    sample?.stop(); sample?.delegate = nil; sample = nil
    deadline?.cancel(); deadline = nil
    playbackDeadline?.cancel(); playbackDeadline = nil
    observers.forEach { NotificationCenter.default.removeObserver($0) }; observers = []
    synth?.delegate = nil; synth = nil
    AssistantAudioCoordinator.shared.release("output:\(id)")
    emit(id, type)
    let waiters = stopWaiters; stopWaiters = []
    waiters.forEach { $0.0(nil) }
  }
  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart message: AVSpeechUtterance) {
    if utterance === message, let id = current { emit(id, "started") }
  }
  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish message: AVSpeechUtterance) {
    if utterance === message, let id = current { finish(id, type: "end") }
  }
  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel message: AVSpeechUtterance) {
    if utterance === message, let id = current { finish(id, type: "end") }
  }
  override func invalidate() {
    DispatchQueue.main.async { [self] in observing = false; pack.cancel(); cancel(); renderer = nil; if let observer = memoryObserver { NotificationCenter.default.removeObserver(observer) }; memoryObserver = nil }
    super.invalidate()
  }
}
