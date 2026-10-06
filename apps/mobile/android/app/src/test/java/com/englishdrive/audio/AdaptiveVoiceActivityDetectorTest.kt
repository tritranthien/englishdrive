package com.englishdrive.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AdaptiveVoiceActivityDetectorTest {
  @Test
  fun ignoresSteadyNoiseAndOneShortSpike() {
    val detector = AdaptiveVoiceActivityDetector()
    repeat(15) { assertNull(detector.processPcm16(pcm(500))) }
    repeat(20) { assertNull(detector.processPcm16(pcm(650))) }
    assertNull(detector.processPcm16(pcm(5_000)))
    repeat(3) { assertNull(detector.processPcm16(pcm(650))) }
    assertFalse(detector.isSpeaking)
  }

  @Test
  fun requiresSustainedSpeechAndWaitsForStableSilence() {
    val detector = AdaptiveVoiceActivityDetector()
    repeat(15) { detector.processPcm16(pcm(400)) }
    assertNull(detector.processPcm16(pcm(4_000)))
    assertEquals(true, detector.processPcm16(pcm(4_000)))
    assertTrue(detector.isSpeaking)

    repeat(19) { assertNull(detector.processPcm16(pcm(300))) }
    assertEquals(false, detector.processPcm16(pcm(300)))
    assertFalse(detector.isSpeaking)
  }

  @Test
  fun calibratesAgainstAConsistentlyNoisyEnvironment() {
    val detector = AdaptiveVoiceActivityDetector()
    repeat(15) { detector.processPcm16(pcm(1_500)) }
    repeat(20) { assertNull(detector.processPcm16(pcm(1_800))) }
    assertFalse(detector.isSpeaking)
  }

  private fun pcm(amplitude: Int): ByteArray {
    val bytes = ByteArray(1_280)
    val sample = amplitude.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
    var index = 0
    while (index < bytes.size) {
      bytes[index] = (sample.toInt() and 0xff).toByte()
      bytes[index + 1] = ((sample.toInt() shr 8) and 0xff).toByte()
      index += 2
    }
    return bytes
  }
}
