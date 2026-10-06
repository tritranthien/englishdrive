package com.englishdrive.audio

import android.content.Context
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractor
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractorConfig
import kotlin.math.sqrt

/** Runs the bundled CAM++ speaker-embedding model locally through sherpa-onnx. */
internal class SherpaSpeakerEmbeddingEngine(context: Context) {
  private val extractor =
    SpeakerEmbeddingExtractor(
      context.assets,
      SpeakerEmbeddingExtractorConfig(
        model = MODEL_ASSET,
        numThreads = 2,
        debug = false,
        provider = "cpu",
      ),
    )

  fun compute(pcm16: ByteArray): FloatArray {
    require(pcm16.size >= MIN_SAMPLE_BYTES) { "Not enough speech to identify the speaker" }
    val stream = extractor.createStream()
    return try {
      stream.acceptWaveform(pcm16ToFloat(pcm16), SAMPLE_RATE)
      stream.inputFinished()
      check(extractor.isReady(stream)) { "Speaker model needs a longer speech sample" }
      normalize(extractor.compute(stream))
    } finally {
      stream.release()
    }
  }

  fun close() = extractor.release()

  companion object {
    const val SAMPLE_RATE = 16_000
    const val MODEL_ASSET = "3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx"
    const val MIN_SAMPLE_BYTES = SAMPLE_RATE * 2

    fun isAvailable(context: Context): Boolean =
      try {
        context.assets.open(MODEL_ASSET).use { true }
      } catch (_: Exception) {
        false
      }

    fun cosineSimilarity(left: FloatArray, right: FloatArray): Float {
      if (left.size != right.size || left.isEmpty()) return -1f
      var dot = 0.0
      var leftNorm = 0.0
      var rightNorm = 0.0
      for (index in left.indices) {
        dot += left[index] * right[index]
        leftNorm += left[index] * left[index]
        rightNorm += right[index] * right[index]
      }
      if (leftNorm == 0.0 || rightNorm == 0.0) return -1f
      return (dot / sqrt(leftNorm * rightNorm)).toFloat()
    }

    fun average(embeddings: List<FloatArray>): FloatArray {
      require(embeddings.isNotEmpty()) { "At least one speaker embedding is required" }
      val size = embeddings.first().size
      require(embeddings.all { it.size == size }) { "Speaker embedding dimensions do not match" }
      val result = FloatArray(size)
      embeddings.forEach { embedding ->
        embedding.forEachIndexed { index, value -> result[index] += value }
      }
      return normalize(result)
    }

    private fun normalize(values: FloatArray): FloatArray {
      val magnitude = sqrt(values.sumOf { (it * it).toDouble() }).toFloat()
      check(magnitude > 0f) { "Speaker model returned an empty embedding" }
      return FloatArray(values.size) { values[it] / magnitude }
    }

    private fun pcm16ToFloat(bytes: ByteArray): FloatArray {
      val result = FloatArray(bytes.size / 2)
      var byteIndex = 0
      var sampleIndex = 0
      while (byteIndex + 1 < bytes.size) {
        val sample =
          ((bytes[byteIndex].toInt() and 0xff) or (bytes[byteIndex + 1].toInt() shl 8)).toShort()
        result[sampleIndex++] = sample / 32768f
        byteIndex += 2
      }
      return result
    }
  }
}
