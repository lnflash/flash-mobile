package com.lnflash.assistant

import org.junit.Assert.*
import org.junit.Test

class AssistantAudioCoordinatorTest {
  @Test fun staleOutputCompletionCannotReleaseRecorderOwnership() {
    assertTrue(AssistantAudioCoordinator.claim("output:test"))
    assertFalse(AssistantAudioCoordinator.claim("input:test"))
    AssistantAudioCoordinator.release("output:test")
    assertTrue(AssistantAudioCoordinator.claim("input:test"))
    AssistantAudioCoordinator.release("output:test")
    assertFalse(AssistantAudioCoordinator.claim("output:next"))
    AssistantAudioCoordinator.release("input:test")
    assertTrue(AssistantAudioCoordinator.claim("output:next"))
    AssistantAudioCoordinator.release("output:next")
  }
}
