package com.englishdrive.audio

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin

class PlaybackEchoGuardTest {
  private fun signal(frame: Int, seed: Double = 0.0): Double =
    4_000 * sin(frame * 2 * PI * 233 / 24_000 + seed) +
      2_500 * sin(frame * 2 * PI * 617 / 24_000 + seed * 2) +
      1_700 * sin(frame * 2 * PI * 1_193 / 24_000 + seed * 3)

  private fun pcm(samples: Int, value: (Int) -> Double): ByteArray {
    val bytes = ByteArray(samples * 2)
    for (i in 0 until samples) {
      val v = value(i).toInt().coerceIn(-32768, 32767)
      bytes[i * 2] = v.toByte()
      bytes[i * 2 + 1] = (v shr 8).toByte()
    }
    return bytes
  }

  @Test
  fun `rejects delayed and attenuated rendered playback including reversed phase`() {
    val guard = PlaybackEchoGuard()
    val reference = pcm(24_000) { signal(it) }
    guard.append(reference, 0, reference.size)
    for (gain in listOf(0.4, -0.3)) {
      val echo = pcm(640) { signal(12_000 - 960 - 2_400 + it * 3 / 2) * gain }
      assertTrue(guard.isEcho(echo, 12_000))
    }
  }

  @Test
  fun `preserves unrelated near end speech and meaningful double talk`() {
    val guard = PlaybackEchoGuard()
    val reference = pcm(24_000) { signal(it) }
    guard.append(reference, 0, reference.size)
    val near = pcm(640) { 4_000 * sin(it * 2 * PI * 379 / 16_000) }
    assertFalse(guard.isEcho(near, 12_000))
    val mixed = pcm(640) { signal(12_000 - 960 + it * 3 / 2) * 0.4 + 4_000 * sin(it * 2 * PI * 379 / 16_000) }
    assertFalse(guard.isEcho(mixed, 12_000))
  }

  @Test
  fun `does not classify silence or unrendered future audio as echo`() {
    val guard = PlaybackEchoGuard()
    val reference = pcm(24_000) { signal(it) }
    guard.append(reference, 0, reference.size)
    assertFalse(guard.isEcho(ByteArray(1_280), 12_000))
    assertFalse(guard.isEcho(pcm(640) { signal(it * 3 / 2) }, 0))
  }

  @Test
  fun `reset discards old output and partial writes preserve frame offsets`() {
    val guard = PlaybackEchoGuard()
    val reference = pcm(24_000) { signal(it) }
    guard.append(reference, 0, 18_000)
    guard.append(reference, 18_000, reference.size - 18_000)
    val echo = pcm(640) { signal(12_000 - 960 + it * 3 / 2) * 0.5 }
    assertTrue(guard.isEcho(echo, 12_000))
    guard.reset()
    assertFalse(guard.isEcho(echo, 12_000))
  }

  @Test
  fun `wrapped ring retains only recent playback`() {
    val guard = PlaybackEchoGuard()
    val reference = pcm(90_000) { signal(it) }
    guard.append(reference, 0, reference.size)
    val echo = pcm(640) { signal(90_000 - 960 - 1_200 + it * 3 / 2) * 0.5 }
    assertTrue(guard.isEcho(echo, 90_000))
    assertFalse(guard.isEcho(echo, 12_000))
  }
}
