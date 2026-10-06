package com.englishdrive.audio

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TargetSpeakerAudioGateTest {
  @Test
  fun `verifies a short turn at its end and signals both start and end`() {
    val gate = TargetSpeakerAudioGate(score = { null }, finishScore = { 0.7f })
    assertTrue(gate.process(byteArrayOf(1), true, true).chunks.isEmpty())
    val ended = gate.process(byteArrayOf(2), false, false)
    assertTrue(ended.started)
    assertEquals(false, ended.activity)
    assertEquals(2, ended.chunks.size)
  }

  @Test
  fun `does not release an unmatched short turn`() {
    val gate = TargetSpeakerAudioGate(score = { null }, finishScore = { 0.1f })
    gate.process(byteArrayOf(1), true, true)
    val ended = gate.process(byteArrayOf(2), false, false)
    assertFalse(ended.started)
    assertTrue(ended.chunks.isEmpty())
  }
  @Test
  fun `preserves every frame when AudioRecord reuses its buffer`() {
    var calls = 0
    val gate = TargetSpeakerAudioGate(score = { if (++calls >= 2) 0.9f else 0.1f })
    val buffer = byteArrayOf(1)
    gate.process(buffer, true, true)
    buffer[0] = 2
    gate.process(buffer, true, null)
    buffer[0] = 3
    val result = gate.process(buffer, true, null)
    buffer[0] = 4
    assertEquals(3, result.chunks.size)
    assertArrayEquals(byteArrayOf(1), result.chunks[0])
    assertArrayEquals(byteArrayOf(2), result.chunks[1])
    assertArrayEquals(byteArrayOf(3), result.chunks[2])
  }
  @Test
  fun `holds pre-roll until target speaker is verified`() {
    val scores = ArrayDeque(listOf(0.38f, 0.39f))
    val gate = TargetSpeakerAudioGate(score = { scores.removeFirst() })
    val quiet = byteArrayOf(1)
    val firstSpeech = byteArrayOf(2)
    val secondSpeech = byteArrayOf(3)

    assertTrue(gate.process(quiet, speaking = false, activityChange = null).chunks.isEmpty())
    assertTrue(gate.process(firstSpeech, speaking = true, activityChange = true).chunks.isEmpty())
    val accepted = gate.process(secondSpeech, speaking = true, activityChange = null)

    assertEquals(true, accepted.activity)
    assertEquals(3, accepted.chunks.size)
    assertArrayEquals(quiet, accepted.chunks[0])
    assertArrayEquals(firstSpeech, accepted.chunks[1])
    assertArrayEquals(secondSpeech, accepted.chunks[2])
  }

  @Test
  fun `drops a turn that does not match the target speaker`() {
    val gate = TargetSpeakerAudioGate(score = { 0.1f })

    gate.process(byteArrayOf(1), speaking = true, activityChange = true)
    gate.process(byteArrayOf(2), speaking = true, activityChange = null)
    val ended = gate.process(byteArrayOf(3), speaking = false, activityChange = false)

    assertTrue(ended.chunks.isEmpty())
    assertNull(ended.activity)
  }

  @Test
  fun `keeps evaluating a turn instead of locking it out early`() {
    var score = 0.1f
    val gate =
      TargetSpeakerAudioGate(
        score = { score },
        maxPendingChunks = 2,
      )

    gate.process(byteArrayOf(1), speaking = true, activityChange = true)
    gate.process(byteArrayOf(2), speaking = true, activityChange = null)
    score = 0.9f
    gate.process(byteArrayOf(3), speaking = true, activityChange = null)
    val lateMatch = gate.process(byteArrayOf(4), speaking = true, activityChange = null)

    assertFalse(lateMatch.chunks.isEmpty())
    assertEquals(true, lateMatch.activity)
    val ended = gate.process(byteArrayOf(5), speaking = false, activityChange = false)
    assertEquals(false, ended.activity)
  }

  @Test
  fun `uses continuity margin for the next nearby turn`() {
    var now = 1_000L
    var score = 0.5f
    val gate =
      TargetSpeakerAudioGate(
        score = { score },
        threshold = 0.38f,
        clockMillis = { now },
      )

    gate.process(byteArrayOf(1), speaking = true, activityChange = true)
    val first = gate.process(byteArrayOf(2), speaking = true, activityChange = null)
    assertTrue(first.started)
    gate.process(byteArrayOf(3), speaking = false, activityChange = false)

    now += 2_000
    score = 0.37f
    gate.process(byteArrayOf(4), speaking = true, activityChange = true)
    val accepted = gate.process(byteArrayOf(5), speaking = true, activityChange = null)
    assertTrue(accepted.started)
  }

  @Test
  fun `does not open for one isolated high speaker score`() {
    val scores = ArrayDeque(listOf(0.9f, 0.1f, 0.1f))
    val gate = TargetSpeakerAudioGate(score = { scores.removeFirst() })

    assertFalse(gate.process(byteArrayOf(1), true, true).started)
    assertFalse(gate.process(byteArrayOf(2), true, null).started)
    val ended = gate.process(byteArrayOf(3), false, false)

    assertFalse(ended.started)
    assertTrue(ended.chunks.isEmpty())
  }
}
