package com.englishdrive.audio

import kotlin.math.sqrt

class AdaptiveVoiceActivityDetector : AudioVoiceActivityDetector {
  override var isSpeaking: Boolean = false
    private set
  override var lastRms: Double = 0.0
    private set
  override var currentThreshold: Double = 0.0
    private set

  private var calibrationChunks = CALIBRATION_CHUNKS
  private var noiseFloor = INITIAL_NOISE_FLOOR
  private var speechChunks = 0
  private var quietChunks = 0

  override fun processPcm16(bytes: ByteArray): Boolean? {
    val rms = calculateRms(bytes)
    lastRms = rms
    if (calibrationChunks > 0) {
      noiseFloor = updateNoiseFloor(rms, CALIBRATION_ALPHA)
      calibrationChunks -= 1
      return null
    }

    currentThreshold =
      maxOf(MINIMUM_RMS_THRESHOLD, noiseFloor * NOISE_MULTIPLIER + NOISE_MARGIN)
    val aboveThreshold = rms >= currentThreshold
    if (isSpeaking) {
      if (aboveThreshold) quietChunks = 0 else quietChunks += 1
      if (quietChunks < QUIET_CHUNKS_BEFORE_STOP) return null
      isSpeaking = false
      speechChunks = 0
      quietChunks = 0
      return false
    }

    if (aboveThreshold) {
      speechChunks += 1
      if (speechChunks < SPEECH_CHUNKS_BEFORE_START) return null
      isSpeaking = true
      speechChunks = 0
      quietChunks = 0
      return true
    }

    speechChunks = 0
    noiseFloor = updateNoiseFloor(rms, TRACKING_ALPHA)
    return null
  }

  override fun reset() {
    isSpeaking = false
    calibrationChunks = CALIBRATION_CHUNKS
    noiseFloor = INITIAL_NOISE_FLOOR
    speechChunks = 0
    quietChunks = 0
    lastRms = 0.0
    currentThreshold = 0.0
  }

  private fun updateNoiseFloor(rms: Double, alpha: Double): Double =
    ((1.0 - alpha) * noiseFloor + alpha * rms).coerceIn(MINIMUM_NOISE_FLOOR, MAXIMUM_NOISE_FLOOR)

  private fun calculateRms(bytes: ByteArray): Double {
    var sum = 0.0
    var index = 0
    var samples = 0
    while (index + 1 < bytes.size) {
      val sample = ((bytes[index + 1].toInt() shl 8) or (bytes[index].toInt() and 0xff)).toShort()
      sum += sample.toDouble() * sample.toDouble()
      samples += 1
      index += 2
    }
    return if (samples == 0) 0.0 else sqrt(sum / samples)
  }

  companion object {
    private const val CALIBRATION_CHUNKS = 15
    private const val SPEECH_CHUNKS_BEFORE_START = 2
    private const val QUIET_CHUNKS_BEFORE_STOP = 20
    private const val INITIAL_NOISE_FLOOR = 200.0
    private const val MINIMUM_NOISE_FLOOR = 80.0
    private const val MAXIMUM_NOISE_FLOOR = 2_500.0
    private const val MINIMUM_RMS_THRESHOLD = 400.0
    private const val NOISE_MULTIPLIER = 1.4
    private const val NOISE_MARGIN = 120.0
    private const val CALIBRATION_ALPHA = 0.25
    private const val TRACKING_ALPHA = 0.03
  }
}
