package com.englishdrive.audio

import kotlin.math.PI

/**
 * One-pole high-pass filter for 16 kHz PCM16. Wind and road rumble sit below the
 * speech band, where they dominate the level without carrying any speaker
 * identity, so the scoring path filters them out. The audio forwarded to Gemini
 * stays unfiltered.
 */
internal class Pcm16HighPass(private val coefficient: Float = COEFFICIENT) {
  private var previousInput = 0f
  private var previousOutput = 0f

  fun process(pcm16: ByteArray): ByteArray {
    val filtered = ByteArray(pcm16.size)
    var index = 0
    while (index + 1 < pcm16.size) {
      val sample =
        ((pcm16[index].toInt() and 0xff) or (pcm16[index + 1].toInt() shl 8)).toShort().toFloat()
      val output = coefficient * (previousOutput + sample - previousInput)
      previousInput = sample
      previousOutput = output
      val rounded = output.toInt().coerceIn(MIN_SAMPLE, MAX_SAMPLE)
      filtered[index] = (rounded and 0xff).toByte()
      filtered[index + 1] = ((rounded shr 8) and 0xff).toByte()
      index += 2
    }
    return filtered
  }

  fun reset() {
    previousInput = 0f
    previousOutput = 0f
  }

  private companion object {
    const val SAMPLE_RATE = 16_000
    const val CUTOFF_HZ = 150.0
    const val MIN_SAMPLE = -32_768
    const val MAX_SAMPLE = 32_767

    /** RC / (RC + dt) for a one-pole high-pass at [CUTOFF_HZ]. */
    val COEFFICIENT: Float =
      run {
        val dt = 1.0 / SAMPLE_RATE
        val rc = 1.0 / (2.0 * PI * CUTOFF_HZ)
        (rc / (rc + dt)).toFloat()
      }
  }
}
