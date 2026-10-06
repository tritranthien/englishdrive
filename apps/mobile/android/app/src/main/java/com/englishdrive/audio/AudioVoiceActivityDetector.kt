package com.englishdrive.audio

internal interface AudioVoiceActivityDetector {
  val isSpeaking: Boolean
  val lastRms: Double
  val currentThreshold: Double

  fun processPcm16(bytes: ByteArray): Boolean?

  fun reset()

  fun close() = Unit
}
