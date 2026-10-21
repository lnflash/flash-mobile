package com.lnflash.assistant

/** Streams mono PCM without counting startup padding as spoken audio. Worker-only. */
internal class NeuralPcmWriter(
  private val write: (FloatArray, Int, Int) -> Int,
  private val isCurrent: () -> Boolean,
  private val startThresholdFrames: () -> Int,
  private val onStarted: () -> Unit,
  private val onFailure: () -> Unit,
) {
  var audioFrames = 0L
    private set
  private var started = false

  fun append(pcm: FloatArray, last: Boolean): Boolean {
    if (!transfer(pcm, true)) return false
    if (last) {
      // Older Android versions cannot lower AudioTrack's streaming threshold.
      // Prime a short utterance with silence, but finish at its real audio end.
      var missing = (startThresholdFrames().toLong() - audioFrames).coerceAtLeast(0)
      val silence = FloatArray(minOf(1024L, missing).toInt())
      while (missing > 0) {
        val count = minOf(silence.size.toLong(), missing).toInt()
        if (!transfer(silence, false, count)) return false
        missing -= count
      }
    }
    return isCurrent()
  }

  private fun transfer(pcm: FloatArray, spoken: Boolean, length: Int = pcm.size): Boolean {
    var offset = 0
    while (offset < length) {
      if (!isCurrent()) return false
      val count = minOf(1024, length - offset)
      val written = write(pcm, offset, count)
      if (written <= 0 || written > count) { onFailure(); return false }
      offset += written
      if (spoken) audioFrames += written
      if (!isCurrent()) return false
      if (spoken && !started) { started = true; onStarted() }
    }
    return true
  }
}
