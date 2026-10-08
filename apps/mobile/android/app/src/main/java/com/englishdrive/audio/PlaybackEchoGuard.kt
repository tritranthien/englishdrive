package com.englishdrive.audio

import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Rejects only near-identical residual loudspeaker echo after Android's AEC.
 * This is a conservative echo gate, not a replacement for an acoustic echo canceler.
 * Reference positions are rendered AudioTrack frames, not server turn timestamps.
 */
internal class PlaybackEchoGuard {
  private val reference = ShortArray(OUTPUT_RATE * 2)
  private var writtenFrames = 0L

  @Synchronized
  fun append(pcm: ByteArray, offset: Int, count: Int) {
    var index = offset
    while (index + 1 < offset + count) {
      reference[(writtenFrames % reference.size).toInt()] = sample(pcm, index).toShort()
      writtenFrames++
      index += 2
    }
  }

  @Synchronized
  fun isEcho(capture: ByteArray, renderedFrames: Long): Boolean {
    val samples = capture.size / 2
    if (samples < 160 || writtenFrames == 0L || renderedFrames <= 0L) return false
    val earliest = (writtenFrames - reference.size).coerceAtLeast(0L)
    val end = minOf(renderedFrames, writtenFrames)
    val span = (samples - 1) * OUTPUT_RATE / INPUT_RATE
    // Subsample for correlation only; original PCM is forwarded unchanged.
    var energy = 0.0
    var sum = 0.0
    var n = 0
    for (i in 0 until samples step STRIDE) {
      val value = sample(capture, i * 2).toDouble()
      sum += value
      energy += value * value
      n++
    }
    val centeredEnergy = energy - sum * sum / n
    if (centeredEnergy / n < MIN_RMS * MIN_RMS) return false

    // Include a small lead to tolerate AudioRecord/AudioTrack timestamp jitter.
    for (delay in -LEAD_FRAMES..MAX_DELAY_FRAMES step DELAY_STEP_FRAMES) {
      val start = end - samples * OUTPUT_RATE / INPUT_RATE - delay
      if (start < earliest || start + span >= writtenFrames) continue
      var referenceSum = 0.0
      var referenceEnergy = 0.0
      var dot = 0.0
      for (i in 0 until samples step STRIDE) {
        val value = reference[((start + i * OUTPUT_RATE / INPUT_RATE) % reference.size).toInt()].toDouble()
        referenceSum += value
        referenceEnergy += value * value
        dot += sample(capture, i * 2) * value
      }
      val centeredReferenceEnergy = referenceEnergy - referenceSum * referenceSum / n
      if (centeredReferenceEnergy / n < MIN_RMS * MIN_RMS) continue
      val correlation = abs(dot - sum * referenceSum / n) / sqrt(centeredEnergy * centeredReferenceEnergy)
      // >= .94 means >88% of the centered signal is explained by playback.
      // Independent near-end speech (double talk) must remain available to AEC/VAD.
      if (correlation >= MIN_CORRELATION) return true
    }
    return false
  }

  @Synchronized
  fun reset() {
    writtenFrames = 0L
    reference.fill(0)
  }

  private fun sample(bytes: ByteArray, offset: Int): Int =
    ((bytes[offset].toInt() and 0xff) or (bytes[offset + 1].toInt() shl 8)).toShort().toInt()

  private companion object {
    const val INPUT_RATE = 16_000
    const val OUTPUT_RATE = 24_000
    const val STRIDE = 4
    const val DELAY_STEP_FRAMES = 12 // 0.5 ms
    const val LEAD_FRAMES = OUTPUT_RATE * 80 / 1_000
    const val MAX_DELAY_FRAMES = OUTPUT_RATE * 350 / 1_000
    const val MIN_RMS = 120.0
    const val MIN_CORRELATION = 0.94
  }
}
