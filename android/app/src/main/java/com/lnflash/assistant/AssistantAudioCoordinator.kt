package com.lnflash.assistant

/** Main-looper ownership; stale callbacks cannot release a newer audio session. */
internal object AssistantAudioCoordinator {
  private var owner: String? = null
  fun claim(id: String): Boolean {
    if (owner != null && owner != id) return false
    owner = id
    return true
  }
  fun release(id: String) { if (owner == id) owner = null }
}
