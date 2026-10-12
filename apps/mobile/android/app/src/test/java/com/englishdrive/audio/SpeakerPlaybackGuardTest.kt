package com.englishdrive.audio

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpeakerPlaybackGuardTest {
  @Test fun `blocks queued playback before the writer starts and while PCM drains`() {
    var now = 1_000L
    val guard = SpeakerPlaybackGuard { now }
    assertFalse(guard.suppressCapture(0))
    guard.queued()
    assertTrue(guard.suppressCapture(0))
    guard.written(4_800)
    guard.completed()
    assertTrue(guard.suppressCapture(1_200))
    now += 499
    assertTrue(guard.suppressCapture(2_400))
    now += 1
    assertFalse(guard.suppressCapture(2_400))
  }

  @Test fun `draining one buffer does not unmute another queued response`() {
    var now = 0L
    val guard = SpeakerPlaybackGuard { now }
    guard.queued()
    guard.queued()
    guard.written(200)
    guard.completed()
    assertTrue(guard.suppressCapture(100))
    now = 1_000
    assertTrue(guard.suppressCapture(100))
    guard.completed()
    now += SpeakerPlaybackGuard.ECHO_TAIL_MS
    assertFalse(guard.suppressCapture(100))
  }

  @Test fun `flush reset discards old queue counts and frame positions`() {
    val guard = SpeakerPlaybackGuard { 1_000 }
    guard.queued()
    guard.written(48_000)
    assertTrue(guard.suppressCapture(0))
    guard.reset()
    assertFalse(guard.suppressCapture(0))
    guard.queued()
    assertTrue(guard.suppressCapture(0))
  }
}
