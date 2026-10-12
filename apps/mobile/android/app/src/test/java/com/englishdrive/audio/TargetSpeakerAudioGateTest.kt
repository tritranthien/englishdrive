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
  fun `does not lower the match threshold during continuity`() {
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

    now += 20_000
    gate.reset(clearIdentity = false)
    score = 0.37f
    // A score below the threshold must not be rescued by continuity.
    gate.process(ByteArray(6_400), speaking = true, activityChange = true)
    val rejected = gate.process(byteArrayOf(5), speaking = false, activityChange = false)
    assertFalse(rejected.started)
  }

  @Test
  fun `short replies inherit only a verified unexpired identity and preserve audio`() {
    var now = 1_000L
    var value: Float? = 0.8f
    val gate = TargetSpeakerAudioGate(score = { value }, clockMillis = { now })
    verify(gate)
    value = null
    gate.reset(clearIdentity = false)
    now += 20_000
    val speech = ByteArray(6_400) { 3 }
    gate.process(speech, true, true)
    speech.fill(7)
    val accepted = gate.process(byteArrayOf(5), false, false)
    assertTrue(accepted.started)
    assertEquals(false, accepted.activity)
    assertEquals("short-reply-continuity", accepted.reason)
    assertNull(accepted.confidence)
    assertEquals(2, accepted.chunks.size)
    assertEquals(3.toByte(), accepted.chunks.first().first())

    // Repeated short replies cannot keep the identity alive indefinitely.
    now += 10_001
    gate.process(ByteArray(6_400), true, true)
    assertTrue(gate.process(byteArrayOf(5), false, false).chunks.isEmpty())
  }

  @Test
  fun `does not inherit at startup after reset or for a long unscorable turn`() {
    var value: Float? = null
    val gate = TargetSpeakerAudioGate(score = { value })
    gate.process(ByteArray(6_400), true, true)
    assertTrue(gate.process(byteArrayOf(1), false, false).chunks.isEmpty())
    value = 0.8f
    verify(gate)
    value = null
    gate.process(ByteArray(64_000), true, true)
    assertTrue(gate.process(byteArrayOf(1), false, false).chunks.isEmpty())
    gate.reset()
    gate.process(ByteArray(6_400), true, true)
    assertTrue(gate.process(byteArrayOf(1), false, false).chunks.isEmpty())
  }

  @Test
  fun `a mismatching long turn clears identity for following short replies`() {
    var value: Float? = 0.8f
    val gate = TargetSpeakerAudioGate(score = { value })
    verify(gate)
    value = 0.1f
    gate.process(ByteArray(64_000), true, true)
    assertTrue(gate.process(byteArrayOf(1), false, false).chunks.isEmpty())
    value = null
    gate.process(ByteArray(6_400), true, true)
    assertTrue(gate.process(byteArrayOf(1), false, false).chunks.isEmpty())
  }

  @Test
  fun `a failed final score clears identity and a later match restores it`() {
    var value: Float? = 0.8f
    var final: Float? = null
    val gate = TargetSpeakerAudioGate(score = { value }, finishScore = { final })
    verify(gate)
    value = null
    final = 0.1f
    gate.process(ByteArray(64_000), true, true)
    assertTrue(gate.process(byteArrayOf(1), false, false).chunks.isEmpty())
    final = null
    gate.process(ByteArray(6_400), true, true)
    assertTrue(gate.process(byteArrayOf(1), false, false).chunks.isEmpty())
    value = 0.8f
    verify(gate)
    value = null
    gate.process(ByteArray(6_400), true, true)
    assertTrue(gate.process(byteArrayOf(1), false, false).started)
  }

  private fun verify(gate: TargetSpeakerAudioGate) {
    gate.process(byteArrayOf(1), true, true)
    assertTrue(gate.process(byteArrayOf(2), true, null).started)
    gate.process(byteArrayOf(3), false, false)
  }

  @Test
  fun `manual threshold is used directly including equality and values above old caps`() {
    var value = 0.69f
    val gate = TargetSpeakerAudioGate(score = { value }, threshold = 0.70f)
    gate.process(byteArrayOf(1), true, true)
    assertFalse(gate.process(byteArrayOf(2), true, null).started)
    gate.process(byteArrayOf(3), false, false)
    value = 0.70f
    verify(gate)
    gate.updateThreshold(1f)
    value = 0.99f
    gate.process(byteArrayOf(1), true, true)
    assertFalse(gate.process(byteArrayOf(2), true, null).started)
    gate.updateThreshold(0f)
    value = 0f
    assertTrue(gate.process(byteArrayOf(1), true, true).started)
  }

  @Test
  fun `latest score is not the best score of a rejected turn`() {
    val scores = ArrayDeque(listOf(0.8f, 0.2f))
    val gate = TargetSpeakerAudioGate(score = { if (scores.isEmpty()) null else scores.removeFirst() }, finishScore = { 0.1f })
    val first = gate.process(byteArrayOf(1), true, true)
    assertEquals(0.8f, first.latestScore!!, 0.0001f)
    val next = gate.process(byteArrayOf(2), true, null)
    assertEquals(0.2f, next.latestScore!!, 0.0001f)
    val ended = gate.process(byteArrayOf(3), false, false)
    assertEquals(0.8f, ended.confidence!!, 0.0001f)
    assertEquals(0.1f, ended.latestScore!!, 0.0001f)
    assertTrue(ended.scoreUpdated)
    assertFalse(ended.started)
  }

  @Test
  fun `threshold update clears inherited identity and next turn starts without a stale score`() {
    var value: Float? = 0.8f
    val gate = TargetSpeakerAudioGate(score = { value })
    verify(gate)
    gate.updateThreshold(0.2f)
    value = null
    val start = gate.process(ByteArray(6_400), true, true)
    assertNull(start.latestScore)
    val ended = gate.process(byteArrayOf(1), false, false)
    assertFalse(ended.started)
    assertNull(ended.latestScore)
    value = 0.3f
    verify(gate)
  }

  @Test
  fun `ignores a very brief sound even with a verified identity`() {
    var value: Float? = 0.8f
    val gate = TargetSpeakerAudioGate(score = { value })
    verify(gate)
    value = null
    gate.process(ByteArray(6_398), true, true)
    assertTrue(gate.process(byteArrayOf(1), false, false).chunks.isEmpty())
  }

  @Test
  fun `VAD silence tail does not make a short reply require a new embedding`() {
    var value: Float? = 0.8f
    var speechBytes = 64_000
    val gate = TargetSpeakerAudioGate(score = { value }, collectedSpeechBytes = { speechBytes })
    verify(gate)
    value = null
    speechBytes = 48_000 // 1.5 seconds of real speech, plus VAD hangover below.
    gate.process(ByteArray(80_000), true, true)
    assertTrue(gate.process(byteArrayOf(1), false, false).started)
    speechBytes = 0
    gate.process(ByteArray(12_800), true, true)
    assertTrue(gate.process(byteArrayOf(1), false, false).chunks.isEmpty())
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

  @Test
  fun `zero threshold releases a first short reply without computing an embedding`() {
    val gate = TargetSpeakerAudioGate(
      threshold = 0f,
      score = { error("Zero threshold must not require a score") },
      finishScore = { error("Zero threshold must not require a final score") },
    )
    val preRoll = byteArrayOf(1)
    val first = byteArrayOf(2)
    gate.process(preRoll, false, null)
    val started = gate.process(first, true, true)
    assertTrue(started.started)
    assertEquals(true, started.activity)
    assertEquals("threshold-disabled", started.reason)
    assertNull(started.latestScore)
    assertEquals(2, started.chunks.size)
    assertArrayEquals(preRoll, started.chunks[0])
    assertArrayEquals(first, started.chunks[1])
    assertEquals(1, gate.process(byteArrayOf(3), true, null).chunks.size)
    val ended = gate.process(byteArrayOf(4), false, false)
    assertEquals(false, ended.activity)
    assertFalse(ended.started)
    assertEquals(1, ended.chunks.size)
  }

  @Test
  fun `zero threshold keeps silence closed and can be reenabled without inherited identity`() {
    val gate = TargetSpeakerAudioGate(score = { null }, threshold = 0f)
    assertTrue(gate.process(byteArrayOf(1), false, null).chunks.isEmpty())
    assertTrue(gate.process(byteArrayOf(2), true, true).started)
    gate.process(byteArrayOf(3), false, false)
    gate.updateThreshold(0.2f)
    assertFalse(gate.process(ByteArray(6_400), true, true).started)
    assertTrue(gate.process(byteArrayOf(4), false, false).chunks.isEmpty())
    gate.updateThreshold(0f)
    assertTrue(gate.process(byteArrayOf(5), true, true).started)
  }

  @Test
  fun `positive threshold primes onset then compares a short first reply at its end`() {
    val primed = mutableListOf<ByteArray>()
    var finalScore = 0.15f
    val gate = TargetSpeakerAudioGate(
      score = { null }, threshold = 0.1f, primeScore = { primed += it },
      finishScore = { finalScore },
    )
    gate.process(byteArrayOf(1), false, null)
    assertTrue(gate.process(byteArrayOf(2), true, true).chunks.isEmpty())
    assertEquals(1, primed.size)
    assertArrayEquals(byteArrayOf(1), primed[0])
    val accepted = gate.process(byteArrayOf(3), false, false)
    assertTrue(accepted.started)
    assertEquals("end-of-turn-match", accepted.reason)
    assertEquals(0.15f, accepted.latestScore!!, 0.0001f)
    assertEquals(3, accepted.chunks.size)
    finalScore = 0.05f
    gate.process(byteArrayOf(4), true, true)
    val rejected = gate.process(byteArrayOf(5), false, false)
    assertFalse(rejected.started)
    assertTrue(rejected.chunks.isEmpty())
  }

  @Test
  fun `unreliable short scores retain recent identity without extending its deadline`() {
    var now = 1_000L
    var score: Float? = 0.8f
    var finalScore: Float? = null
    val gate = TargetSpeakerAudioGate(
      score = { score }, finishScore = { finalScore }, clockMillis = { now },
    )
    verify(gate)
    score = null
    finalScore = -0.01f
    now += 29_000
    gate.process(ByteArray(16_000), true, true)
    val inherited = gate.process(byteArrayOf(1), false, false)
    assertTrue(inherited.started)
    assertEquals("short-reply-continuity", inherited.reason)
    now += 1_001
    gate.process(ByteArray(16_000), true, true)
    assertFalse(gate.process(byteArrayOf(1), false, false).started)
  }

  @Test
  fun `a high short score is diagnostic only and does not establish identity`() {
    var speechBytes = 16_000
    var streamingScore: Float? = null
    val gate = TargetSpeakerAudioGate(
      threshold = 0.1f, score = { streamingScore }, finishScore = { 0.67f },
      collectedSpeechBytes = { speechBytes },
    )
    gate.process(ByteArray(16_000), true, true)
    val short = gate.process(byteArrayOf(1), false, false)
    assertEquals(0.67f, short.latestScore!!, 0.0001f)
    assertFalse(short.started)
    assertTrue(short.chunks.isEmpty())
    speechBytes = 6_400
    gate.process(ByteArray(6_400), true, true)
    assertFalse(gate.process(byteArrayOf(1), false, false).started)
    speechBytes = 64_000
    streamingScore = 0.6f
    verify(gate)
    streamingScore = null
    speechBytes = 16_000
    gate.process(ByteArray(16_000), true, true)
    assertEquals("short-reply-continuity", gate.process(byteArrayOf(1), false, false).reason)
  }
}
