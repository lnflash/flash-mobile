import AVFoundation

/// Main-queue ownership prevents a late output callback from disabling the mic.
final class AssistantAudioCoordinator {
  static let shared = AssistantAudioCoordinator()
  private var owner: String?
  func claim(_ id: String) -> Bool {
    guard owner == nil || owner == id else { return false }
    owner = id
    return true
  }
  func release(_ id: String) {
    guard owner == id else { return }
    owner = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
