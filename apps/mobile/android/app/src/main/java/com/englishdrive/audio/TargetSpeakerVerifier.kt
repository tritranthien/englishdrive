package com.englishdrive.audio

import android.content.Context
import android.util.Log
import com.englishdrive.BuildConfig
import java.io.ByteArrayOutputStream
import kotlin.math.sqrt

internal class TargetSpeakerVerifier private constructor(
  private val engine: SherpaSpeakerEmbeddingEngine,
  private val profile: SpeakerProfile,
) {
  private val speech = ByteArrayOutputStream(MAX_WINDOW_BYTES)
  private val highPass = Pcm16HighPass()
  private var totalSpeechBytes = 0
  private var bytesSinceScore = 0

  val threshold: Float
    get() =
      minOf(
        profile.threshold,
        if (profile.kind == SpeakerProfileKind.HEADSET) HEADSET_MAX_THRESHOLD
        else PHONE_MAX_THRESHOLD,
      )

  val profileKind: SpeakerProfileKind
    get() = profile.kind

  /** Returns the best similarity across the route-specific enrollment samples. */
  fun score(bytes: ByteArray): Float? {
    // Wind and road rumble are filtered out of the embedding path only, so the
    // audio forwarded to Gemini stays untouched.
    val filtered = highPass.process(bytes)
    if (!hasVoiceEnergy(filtered)) return null
    append(filtered)
    if (totalSpeechBytes < INITIAL_SCORE_BYTES) return null
    if (bytesSinceScore < RESCORE_STEP_BYTES) return null
    bytesSinceScore = 0
    return computeScore()
  }

  /** Evaluates a completed short utterance by tiling it to the model's minimum input. */
  fun finishScore(): Float? {
    if (totalSpeechBytes < MIN_UTTERANCE_BYTES) return null
    return computeScore()
  }

  private fun append(bytes: ByteArray) {
    totalSpeechBytes += bytes.size
    bytesSinceScore += bytes.size
    val combined = speech.toByteArray() + bytes
    val start = (combined.size - MAX_WINDOW_BYTES).coerceAtLeast(0)
    speech.reset()
    speech.write(combined, start, combined.size - start)
  }

  private fun computeScore(): Float {
    val bytes = speech.toByteArray()
    val candidateBytes = tileToMinimum(bytes)
    val candidate = engine.compute(candidateBytes)
    val similarities =
      profile.embeddings.map { SherpaSpeakerEmbeddingEngine.cosineSimilarity(it, candidate) }
    val similarity = similarities.maxOrNull() ?: -1f
    if (BuildConfig.DEBUG) {
      Log.d(
        TAG,
        "Speaker profile=${profile.kind.storageName} similarity=$similarity " +
          "threshold=$threshold bytes=$totalSpeechBytes references=${similarities.size}",
      )
    }
    return similarity
  }

  fun resetTurn() {
    speech.reset()
    highPass.reset()
    totalSpeechBytes = 0
    bytesSinceScore = 0
  }

  fun close() {
    speech.reset()
    engine.close()
  }

  private fun hasVoiceEnergy(bytes: ByteArray): Boolean {
    var energy = 0.0
    var samples = 0
    var index = 0
    while (index + 1 < bytes.size) {
      val sample =
        ((bytes[index].toInt() and 0xff) or (bytes[index + 1].toInt() shl 8))
          .toShort()
          .toDouble()
      energy += sample * sample
      samples += 1
      index += 2
    }
    return samples > 0 && sqrt(energy / samples) >= MIN_SCORING_RMS
  }

  companion object {
    // Score at 800 ms for lower latency. The sample is repeated to the model's one-second minimum.
    private const val INITIAL_SCORE_BYTES = SherpaSpeakerEmbeddingEngine.SAMPLE_RATE * 2 * 8 / 10
    private const val MIN_UTTERANCE_BYTES = SherpaSpeakerEmbeddingEngine.SAMPLE_RATE * 2 * 2 / 10
    private const val MAX_WINDOW_BYTES = SherpaSpeakerEmbeddingEngine.SAMPLE_RATE * 2 * 2
    private const val RESCORE_STEP_BYTES = SherpaSpeakerEmbeddingEngine.SAMPLE_RATE * 2 * 2 / 10
    private const val PHONE_MIN_THRESHOLD = 0.22f
    private const val PHONE_MAX_THRESHOLD = 0.30f
    private const val HEADSET_MIN_THRESHOLD = 0.10f
    private const val HEADSET_MAX_THRESHOLD = 0.16f
    private const val CALIBRATION_MARGIN = 0.22f
    private const val MIN_SCORING_RMS = 120.0
    private const val TAG = "EnglishDriveAudio"

    fun create(context: Context, kind: SpeakerProfileKind): TargetSpeakerVerifier? {
      val profile = SpeakerProfileStore(context).load(kind) ?: return null
      val engine = SherpaSpeakerEmbeddingEngine(context)
      return try {
        TargetSpeakerVerifier(engine, profile)
      } catch (error: Exception) {
        engine.close()
        throw error
      }
    }

    /** 20th-percentile best match between enrollment segments. Low means they disagree. */
    fun enrollmentBaseline(embeddings: List<FloatArray>): Float {
      if (embeddings.size < 2) return 0f
      val bestMatches =
        embeddings.mapIndexed { index, embedding ->
          embeddings
            .filterIndexed { otherIndex, _ -> otherIndex != index }
            .maxOf { other -> SherpaSpeakerEmbeddingEngine.cosineSimilarity(embedding, other) }
        }
      return bestMatches.sorted()[bestMatches.size / 5]
    }

    fun calibratedThreshold(
      embeddings: List<FloatArray>,
      kind: SpeakerProfileKind = SpeakerProfileKind.PHONE,
    ): Float {
      val minimum =
        if (kind == SpeakerProfileKind.HEADSET) HEADSET_MIN_THRESHOLD else PHONE_MIN_THRESHOLD
      val maximum =
        if (kind == SpeakerProfileKind.HEADSET) HEADSET_MAX_THRESHOLD else PHONE_MAX_THRESHOLD
      if (embeddings.size < 2) return maximum
      return (enrollmentBaseline(embeddings) - CALIBRATION_MARGIN).coerceIn(minimum, maximum)
    }

    private fun tileToMinimum(bytes: ByteArray): ByteArray {
      if (bytes.size >= SherpaSpeakerEmbeddingEngine.MIN_SAMPLE_BYTES) return bytes
      val repeated = ByteArray(SherpaSpeakerEmbeddingEngine.MIN_SAMPLE_BYTES)
      var offset = 0
      while (offset < repeated.size) {
        val copyLength = minOf(bytes.size, repeated.size - offset)
        System.arraycopy(bytes, 0, repeated, offset, copyLength)
        offset += copyLength
      }
      return repeated
    }
  }
}
