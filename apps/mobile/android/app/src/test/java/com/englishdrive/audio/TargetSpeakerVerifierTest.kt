package com.englishdrive.audio

import org.junit.Assert.assertEquals
import org.junit.Test

class TargetSpeakerVerifierTest {
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
