package com.lnflash.assistant

import org.junit.Assert.*
import org.junit.Test

/** A streaming sink only starts once its threshold is filled, like AudioTrack. */
class NeuralPcmWriterTest {
  private class Sink(var threshold: Int, val partial: Int = 1024) {
    val samples = mutableListOf<Float>()
    var current = true
    var starts = 0
    var failures = 0
    var afterWrite: () -> Unit = {}
    val playing get() = samples.size >= threshold
    val writer = NeuralPcmWriter(
      write = { pcm, offset, count ->
        val n = minOf(partial, count)
        samples.addAll(pcm.slice(offset until offset + n))
        afterWrite()
        n
      },
      isCurrent = { current },
      startThresholdFrames = { threshold },
      onStarted = { starts++ },
      onFailure = { failures++ },
    )
  }

  @Test fun shortLegacyReplyPrimesPlaybackWithoutExtendingItsSpokenEnd() {
    val sink = Sink(16)
    val pcm = floatArrayOf(.1f, .2f, .3f, .4f, .5f)
    assertTrue(sink.writer.append(pcm, true))
    assertTrue(sink.playing)
    assertEquals(5L, sink.writer.audioFrames)
    assertEquals(16, sink.samples.size)
    assertArrayEquals(pcm, sink.samples.take(5).toFloatArray(), 0f)
    assertTrue(sink.samples.drop(5).all { it == 0f })
    assertEquals(1, sink.starts)
  }

  @Test fun modernOneFrameThresholdNeedsNoPaddingEvenForTinyReply() {
    val sink = Sink(1)
    assertTrue(sink.writer.append(floatArrayOf(.5f), true))
    assertTrue(sink.playing)
    assertEquals(listOf(.5f), sink.samples)
    assertEquals(1L, sink.writer.audioFrames)
  }

  @Test fun partialWritesPreserveAllAudioAcrossChunksAndPrimeOnlyAtEnd() {
    val sink = Sink(16, partial = 3)
    val first = FloatArray(5) { .1f }
    val last = FloatArray(4) { .2f }
    assertTrue(sink.writer.append(first, false))
    assertFalse(sink.playing)
    sink.threshold = 20 // A route can enlarge the effective buffer.
    assertTrue(sink.writer.append(last, true))
    assertTrue(sink.playing)
    assertArrayEquals(first + last, sink.samples.take(9).toFloatArray(), 0f)
    assertEquals(20, sink.samples.size)
    assertEquals(9L, sink.writer.audioFrames)
    assertEquals(1, sink.starts)
  }

  @Test fun longReplyDoesNotGainSilence() {
    val sink = Sink(16, partial = 3)
    val pcm = FloatArray(30) { it / 100f }
    assertTrue(sink.writer.append(pcm, true))
    assertArrayEquals(pcm, sink.samples.toFloatArray(), 0f)
    assertEquals(30L, sink.writer.audioFrames)
  }

  @Test fun cancellationDuringPrimingStopsFurtherWritesWithoutFailure() {
    val sink = Sink(3000)
    sink.afterWrite = { if (sink.samples.size > 4) sink.current = false }
    assertFalse(sink.writer.append(FloatArray(4) { .5f }, true))
    assertEquals(1028, sink.samples.size)
    assertEquals(4L, sink.writer.audioFrames)
    assertEquals(0, sink.failures)
    assertFalse(sink.writer.append(floatArrayOf(.1f), true))
    assertEquals(1028, sink.samples.size)
  }

  @Test fun failedWriteDoesNotStartOrCompletePlayback() {
    var failed = false
    val writer = NeuralPcmWriter(
      write = { _, _, _ -> -1 }, isCurrent = { true },
      startThresholdFrames = { 16 },
      onStarted = { fail("Failed write must not report playback") },
      onFailure = { failed = true },
    )
    assertFalse(writer.append(floatArrayOf(.1f), true))
    assertTrue(failed)
    assertEquals(0L, writer.audioFrames)
  }
}
