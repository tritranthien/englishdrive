package com.englishdrive.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.sin

class TargetSpeakerVerifierTest {
  private val profile = SpeakerProfile(
    SpeakerProfileKind.PHONE, listOf(floatArrayOf(1f, 0f)), 0.3f, "phone", "Phone",
  )

  private fun voice(milliseconds: Int): ByteArray {
    val samples = 16 * milliseconds
    return ByteArray(samples * 2).apply {
      for (index in 0 until samples) {
        val sample = (sin(index * 2.0 * Math.PI * 220.0 / 16_000) * 8_000).toInt()
        this[index * 2] = sample.toByte()
        this[index * 2 + 1] = (sample shr 8).toByte()
      }
    }
  }

  @Test
  fun `scores a completed short first turn using real voiced onset without padding`() {
    var computes = 0
    var submittedBytes = 0
    val verifier = TargetSpeakerVerifier(profile, computeEmbedding = {
      computes += 1
      submittedBytes = it.size
      floatArrayOf(1f, 0f)
    })
    verifier.prime(voice(160))
    assertNull(verifier.score(voice(240)))
    assertEquals(0, computes)
    assertEquals(1f, verifier.finishScore()!!, 0.0001f)
    assertEquals(12_800, submittedBytes) // actual 400 ms, not a repeated two-second sample
    assertEquals(1, computes)
  }

  @Test
  fun `silence and tiny samples do not create a short turn score`() {
    val verifier = TargetSpeakerVerifier(profile, computeEmbedding = { error("Too little speech") })
    verifier.prime(ByteArray(32_000))
    assertEquals(0, verifier.collectedSpeechBytes)
    assertNull(verifier.score(voice(200)))
    assertNull(verifier.finishScore())
    verifier.resetTurn()
    assertEquals(0, verifier.collectedSpeechBytes)
    assertNull(verifier.finishScore())
  }

  @Test
  fun `a completed short mismatching turn still gets a real negative score`() {
    val verifier = TargetSpeakerVerifier(profile, computeEmbedding = { floatArrayOf(0f, 1f) })
    assertNull(verifier.score(voice(600)))
    assertEquals(0f, verifier.finishScore()!!, 0.0001f)
    assertTrue(verifier.collectedSpeechBytes < 64_000)
  }

  @Test
  fun `calibration clamps permissive profiles to the minimum threshold`() {
    val embeddings =
      listOf(
        floatArrayOf(1f, 0f),
        floatArrayOf(0f, 1f),
        floatArrayOf(-1f, 0f),
      )

    assertEquals(0.22f, TargetSpeakerVerifier.calibratedThreshold(embeddings), 0.0001f)
  }

  @Test
  fun `calibration caps similar enrollment samples at the proven threshold`() {
    val embeddings = List(5) { floatArrayOf(1f, 0f) }

    assertEquals(0.30f, TargetSpeakerVerifier.calibratedThreshold(embeddings), 0.0001f)
  }

  @Test
  fun `uses a lower calibrated range for narrow-band headset microphones`() {
    val embeddings = List(5) { floatArrayOf(1f, 0f) }

    assertEquals(
      0.16f,
      TargetSpeakerVerifier.calibratedThreshold(embeddings, SpeakerProfileKind.HEADSET),
      0.0001f,
    )
  }
}
