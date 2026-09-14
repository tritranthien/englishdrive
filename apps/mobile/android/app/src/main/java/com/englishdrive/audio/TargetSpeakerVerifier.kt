package com.englishdrive.audio

import android.content.Context
import android.util.Log
import com.englishdrive.BuildConfig
import java.io.ByteArrayOutputStream

internal class TargetSpeakerVerifier private constructor(
  private val engine: SherpaSpeakerEmbeddingEngine,
  private val profile: FloatArray,
) {
  private val speech = ByteArrayOutputStream(WINDOW_BYTES)
  private var scored = false

  /** Returns one cosine score once enough speech has accumulated for a stable embedding. */
  fun score(bytes: ByteArray): Float? {
    if (scored) return null
    val remaining = WINDOW_BYTES - speech.size()
    speech.write(bytes, 0, minOf(bytes.size, remaining))
    if (speech.size() < WINDOW_BYTES) return null
    return computeScore()
  }

  // Short utterances can end before the full window is collected. Require at
  // least 800 ms of captured audio; pad only to the extractor's 1-second input.
  fun finishScore(): Float? {
    if (scored || speech.size() < MIN_SHORT_BYTES) return null
    return computeScore()
  }

  private fun computeScore(): Float {
    scored = true
    val bytes = speech.toByteArray()
    val candidate = engine.compute(bytes.copyOf(maxOf(bytes.size, 32_000)))
    val similarity = SherpaSpeakerEmbeddingEngine.cosineSimilarity(profile, candidate)
    if (BuildConfig.DEBUG) Log.d("EnglishDriveAudio", "Speaker similarity=$similarity")
    return similarity
  }

  fun resetTurn() {
    speech.reset()
    scored = false
  }

  fun close() {
    speech.reset()
    engine.close()
  }

  companion object {
    // The gate adds 240 ms of pre-roll, so verification normally completes after
    // roughly one second of newly detected speech.
    private const val WINDOW_BYTES = SherpaSpeakerEmbeddingEngine.SAMPLE_RATE * 2 * 6 / 5
    private const val MIN_SHORT_BYTES = SherpaSpeakerEmbeddingEngine.SAMPLE_RATE * 2 * 4 / 5

    fun create(context: Context): TargetSpeakerVerifier? {
      val profile = SpeakerProfileStore(context).load() ?: return null
      val engine = SherpaSpeakerEmbeddingEngine(context)
      return try {
        TargetSpeakerVerifier(engine, profile)
      } catch (error: Exception) {
        engine.close()
        throw error
      }
    }
  }
}
