package com.englishdrive.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SherpaSpeakerEmbeddingEngineTest {
  @Test
  fun `cosine similarity distinguishes matching and opposite embeddings`() {
    assertEquals(
      1f,
      SherpaSpeakerEmbeddingEngine.cosineSimilarity(floatArrayOf(1f, 2f), floatArrayOf(1f, 2f)),
      0.0001f,
    )
    assertEquals(
      -1f,
      SherpaSpeakerEmbeddingEngine.cosineSimilarity(floatArrayOf(1f, 0f), floatArrayOf(-1f, 0f)),
      0.0001f,
    )
  }

  @Test
  fun `averaged enrollment embedding is normalized`() {
    val average =
      SherpaSpeakerEmbeddingEngine.average(
        listOf(floatArrayOf(1f, 0f), floatArrayOf(0f, 1f)),
      )

    assertEquals(average[0], average[1], 0.0001f)
    assertTrue(average.all { it in 0f..1f })
    assertEquals(1f, average.sumOf { (it * it).toDouble() }.toFloat(), 0.0001f)
  }
}
