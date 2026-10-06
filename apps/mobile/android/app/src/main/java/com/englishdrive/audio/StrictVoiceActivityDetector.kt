package com.englishdrive.audio

import android.content.Context
import android.util.Log
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig

/** Combines a speech model with an adaptive noise-floor energy gate. */
internal class StrictVoiceActivityDetector(context: Context) : AudioVoiceActivityDetector {
  private val energyDetector = AdaptiveVoiceActivityDetector()
  private val silero =
    Vad(
      context.assets,
      VadModelConfig(
        sileroVadModelConfig =
          SileroVadModelConfig(
            model = MODEL_ASSET,
            threshold = SPEECH_PROBABILITY_THRESHOLD,
            minSilenceDuration = MIN_SILENCE_SECONDS,
            minSpeechDuration = MIN_SPEECH_SECONDS,
            windowSize = WINDOW_SIZE,
            maxSpeechDuration = MAX_SPEECH_SECONDS,
          ),
        sampleRate = SAMPLE_RATE,
        numThreads = 1,
        provider = "cpu",
        debug = false,
      ),
    )

  override var isSpeaking = false
    private set
  override val lastRms: Double
    get() = energyDetector.lastRms
  override val currentThreshold: Double
    get() = energyDetector.currentThreshold

  override fun processPcm16(bytes: ByteArray): Boolean? {
    energyDetector.processPcm16(bytes)
    silero.acceptWaveform(pcm16ToFloat(bytes))
    val modelDetectedSpeech = silero.isSpeechDetected()
    val hasSpeechEnergy =
      currentThreshold == 0.0 || lastRms >= currentThreshold || energyDetector.isSpeaking
    val nextSpeaking = modelDetectedSpeech && hasSpeechEnergy
    if (nextSpeaking == isSpeaking) return null
    isSpeaking = nextSpeaking
    return nextSpeaking
  }

  override fun reset() {
    isSpeaking = false
    energyDetector.reset()
    silero.reset()
  }

  override fun close() = silero.release()

  private fun pcm16ToFloat(bytes: ByteArray): FloatArray {
    val samples = FloatArray(bytes.size / 2)
    var byteIndex = 0
    var sampleIndex = 0
    while (byteIndex + 1 < bytes.size) {
      val sample =
        ((bytes[byteIndex].toInt() and 0xff) or (bytes[byteIndex + 1].toInt() shl 8)).toShort()
      samples[sampleIndex++] = sample / 32768f
      byteIndex += 2
    }
    return samples
  }

  companion object {
    const val MODEL_ASSET = "silero_vad.onnx"
    private const val SAMPLE_RATE = 16_000
    private const val WINDOW_SIZE = 512
    private const val SPEECH_PROBABILITY_THRESHOLD = 0.65f
    private const val MIN_SPEECH_SECONDS = 0.12f
    private const val MIN_SILENCE_SECONDS = 0.45f
    private const val MAX_SPEECH_SECONDS = 90f
    private const val TAG = "EnglishDriveAudio"

    fun createOrFallback(context: Context): AudioVoiceActivityDetector =
      try {
        StrictVoiceActivityDetector(context).also {
          Log.i(TAG, "Strict audio VAD enabled: silero + adaptive noise floor")
        }
      } catch (error: Exception) {
        Log.e(TAG, "Silero VAD unavailable; using adaptive energy VAD", error)
        AdaptiveVoiceActivityDetector()
      }
  }
}
