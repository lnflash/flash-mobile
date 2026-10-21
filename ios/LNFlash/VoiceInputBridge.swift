import AVFoundation
import React
import Speech
import UIKit

/// Audio never leaves the OS's on-device recognizer or enters persistent storage.
@objc(VoiceInputBridge)
final class VoiceInputBridge: RCTEventEmitter {
  private var session: String?
  private var engine: AVAudioEngine?
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var recognizer: SFSpeechRecognizer?
  private var captureInputIDs: [String] = []
  private var timeout: DispatchWorkItem?
  private var observers: [NSObjectProtocol] = []
  private var observing = false
  private var ownsAudio = false
  private var tapInstalled = false
  private var stopping = false

  override static func requiresMainQueueSetup() -> Bool { true }
  override var methodQueue: DispatchQueue! { DispatchQueue.main }
  override func supportedEvents() -> [String]! { ["VoiceInputEvent"] }
  override func startObserving() { observing = true }
  override func stopObserving() {
    if !Thread.isMainThread {
      DispatchQueue.main.async { [weak self] in self?.stopObserving() }
      return
    }
    observing = false
    finish(error: "interrupted")
  }

  @objc(capability:resolver:rejecter:)
  func capability(_ locale: String, resolver resolve: RCTPromiseResolveBlock,
                  rejecter reject: RCTPromiseRejectBlock) {
    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))
    resolve(recognizer?.supportsOnDeviceRecognition == true && recognizer?.isAvailable == true)
  }

  @objc(requestPermission:rejecter:)
  func requestPermission(_ resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    AVAudioSession.sharedInstance().requestRecordPermission { granted in
      guard granted else { resolve("blocked"); return }
      SFSpeechRecognizer.requestAuthorization { status in
        switch status {
        case .authorized: resolve("granted")
        case .restricted: resolve("restricted")
        default: resolve("blocked")
        }
      }
    }
  }

  @objc(start:locale:)
  func start(_ id: String, locale: String) {
    guard session == nil else {
      emit(id, "error", text: "unavailable"); emit(id, "end"); return
    }
    session = id
    stopping = false
    guard AVAudioSession.sharedInstance().recordPermission == .granted,
          SFSpeechRecognizer.authorizationStatus() == .authorized else {
      finish(error: "permission"); return
    }
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)),
          recognizer.supportsOnDeviceRecognition, recognizer.isAvailable else {
      finish(error: "unavailable"); return
    }
    guard AssistantAudioCoordinator.shared.claim("input:\(id)") else {
      finish(error: "unavailable"); return
    }
    self.recognizer = recognizer
    let audio = AVAudioSession.sharedInstance()
    do {
      ownsAudio = true
      try audio.setCategory(.record, mode: .measurement, options: [.duckOthers])
      try audio.setActive(true, options: [])
      captureInputIDs = audio.currentRoute.inputs.map { $0.uid }
      let engine = AVAudioEngine()
      let request = SFSpeechAudioBufferRecognitionRequest()
      request.requiresOnDeviceRecognition = true
      request.shouldReportPartialResults = true
      self.engine = engine
      self.request = request
      let input = engine.inputNode
      let format = input.outputFormat(forBus: 0)
      guard format.sampleRate > 0, format.channelCount > 0 else {
        finish(error: "failure"); return
      }
      input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        request.append(buffer)
      }
      tapInstalled = true
      engine.prepare()
      task = recognizer.recognitionTask(with: request) { [weak self] result, error in
        DispatchQueue.main.async {
          guard let self = self, self.session == id else { return }
          if let result = result {
            self.emit(id, result.isFinal ? "final" : "interim",
                      text: result.bestTranscription.formattedString)
            if result.isFinal { self.finish(); return }
          }
          if error != nil { self.finish(error: "failure") }
        }
      }
      try engine.start()
      let center = NotificationCenter.default
      observers.append(center.addObserver(
        forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
      ) { [weak self] notification in
        let type = (notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue
        if type == AVAudioSession.InterruptionType.began.rawValue {
          self?.finish(error: "interrupted")
        }
      })
      observers.append(center.addObserver(
        forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
      ) { [weak self] notification in self?.handleRouteChange(notification) })
      observers.append(center.addObserver(
        forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
      ) { [weak self] _ in self?.finish(error: "interrupted") })
      emit(id, "started")
      scheduleTimeout(id, seconds: 60)
    } catch {
      finish(error: "failure")
    }
  }

  private func handleRouteChange(_ notification: Notification) {
    guard session != nil, engine != nil, !stopping else { return }
    let rawReason = (notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? NSNumber)?.uintValue ?? 0
    let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason) ?? .unknown
    // setCategory(.record) queues this notification while start() is still on
    // the main queue. It can arrive after observers are installed; cancelling
    // it would stop every hold immediately after recording starts.
    guard reason != .categoryChange else { return }
    let inputs = AVAudioSession.sharedInstance().currentRoute.inputs.map { $0.uid }
    if reason == .noSuitableRouteForCategory || inputs != captureInputIDs {
      finish(error: "interrupted")
    }
  }

  @objc(stop:)
  func stop(_ id: String) {
    guard session == id, !stopping else { return }
    stopping = true
    stopCapture()
    request?.endAudio()
    scheduleTimeout(id, seconds: 5)
  }

  @objc(abort:)
  func abort(_ id: String) {
    guard session == id else { return }
    finish(error: "interrupted")
  }

  private func scheduleTimeout(_ id: String, seconds: Double) {
    timeout?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard self?.session == id else { return }
      self?.finish(error: "failure")
    }
    timeout = work
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
  }

  private func emit(_ id: String, _ type: String, text: String? = nil) {
    guard observing else { return }
    var body: [String: Any] = ["sessionId": id, "type": type]
    if let text = text { body["text"] = text }
    sendEvent(withName: "VoiceInputEvent", body: body)
  }

  private func stopCapture() {
    if let engine = engine {
      engine.stop()
      // Only installed once per engine; clearing the reference makes this idempotent.
      if tapInstalled { engine.inputNode.removeTap(onBus: 0); tapInstalled = false }
      self.engine = nil
    }
  }

  private func finish(error: String? = nil) {
    guard let id = session else { return }
    session = nil // Invalidate callbacks before cancelling the task.
    timeout?.cancel()
    timeout = nil
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers = []
    stopCapture()
    request?.endAudio()
    task?.cancel()
    task = nil
    recognizer = nil
    captureInputIDs = []
    request = nil
    if ownsAudio {
      AssistantAudioCoordinator.shared.release("input:\(id)")
      ownsAudio = false
    }
    if let error = error { emit(id, "error", text: error) }
    emit(id, "end")
  }

  override func invalidate() {
    DispatchQueue.main.async { [self] in
      observing = false
      finish(error: "interrupted")
    }
    super.invalidate()
  }
}
