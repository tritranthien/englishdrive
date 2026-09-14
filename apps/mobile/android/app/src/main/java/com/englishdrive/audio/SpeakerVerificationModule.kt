package com.englishdrive.audio

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Process
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import kotlin.concurrent.thread
import kotlin.math.sqrt

class SpeakerVerificationModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  @Volatile private var enrollmentRunning = false
  @Volatile private var enrollmentRecord: AudioRecord? = null
  private var enrollmentThread: Thread? = null
  private val profileStore = SpeakerProfileStore(reactContext)

  override fun getName() = "SpeakerVerification"

  @ReactMethod
  fun getStatus(promise: Promise) = promise.resolve(statusMap())

  @ReactMethod
  fun startEnrollment(promise: Promise) {
    if (!SherpaSpeakerEmbeddingEngine.isAvailable(reactContext)) {
      promise.reject(
        "SPEAKER_MODEL_UNAVAILABLE",
        "The bundled speaker verification model is unavailable",
      )
      return
    }
    if (
      ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject("MICROPHONE_PERMISSION_REQUIRED", "Microphone permission is required")
      return
    }
    if (enrollmentRunning || !MicrophoneLease.acquire(ENROLLMENT_OWNER)) {
      promise.reject("MICROPHONE_BUSY", "The microphone is already in use")
      return
    }

    enrollmentRunning = true
    enrollmentThread =
      thread(start = true, name = "englishdrive-speaker-enrollment") {
        Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
        runEnrollment(promise)
      }
  }

  @ReactMethod
  fun cancelEnrollment(promise: Promise) {
    stopEnrollment()
    promise.resolve(statusMap())
  }

  @ReactMethod
  fun deleteProfile(promise: Promise) {
    if (enrollmentRunning) {
      promise.reject("ENROLLMENT_ACTIVE", "Cancel voice enrollment first")
      return
    }
    profileStore.clear()
    promise.resolve(statusMap())
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun runEnrollment(promise: Promise) {
    var engine: SherpaSpeakerEmbeddingEngine? = null
    var record: AudioRecord? = null
    try {
      engine = SherpaSpeakerEmbeddingEngine(reactContext)

      val minBuffer =
        AudioRecord.getMinBufferSize(
          SAMPLE_RATE,
          AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT,
        )
      record =
        AudioRecord.Builder()
          .setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
          .setAudioFormat(
            AudioFormat.Builder()
              .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
              .setSampleRate(SAMPLE_RATE)
              .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
              .build(),
          )
          .setBufferSizeInBytes(maxOf(minBuffer, INPUT_CHUNK_BYTES * 4))
          .build()
      check(record.state == AudioRecord.STATE_INITIALIZED) {
        "Could not initialize microphone for voice enrollment"
      }
      enrollmentRecord = record

      val segment = ByteArrayOutputStream(ENROLLMENT_SEGMENT_BYTES)
      val embeddings = mutableListOf<FloatArray>()
      val buffer = ByteArray(INPUT_CHUNK_BYTES)
      val deadline = System.currentTimeMillis() + ENROLLMENT_TIMEOUT_MS
      var lastReported = -1
      record.startRecording()
      emitProgress(0)
      while (
        enrollmentRunning &&
          embeddings.size < ENROLLMENT_SEGMENTS &&
          System.currentTimeMillis() < deadline
      ) {
        val count = record.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
        if (count <= 0) continue
        if (!hasSpeechEnergy(buffer, count)) continue

        val remaining = ENROLLMENT_SEGMENT_BYTES - segment.size()
        segment.write(buffer, 0, minOf(count, remaining))
        if (segment.size() >= ENROLLMENT_SEGMENT_BYTES) {
          embeddings += engine.compute(segment.toByteArray())
          segment.reset()
        }
        val capturedBytes =
          embeddings.size * ENROLLMENT_SEGMENT_BYTES + segment.size()
        val rounded =
          (capturedBytes * 100 / (ENROLLMENT_SEGMENT_BYTES * ENROLLMENT_SEGMENTS))
            .coerceIn(0, 100)
        if (rounded != lastReported) {
          lastReported = rounded
          emitProgress(rounded)
        }
      }
      if (!enrollmentRunning) throw EnrollmentCancelledException()
      check(embeddings.size == ENROLLMENT_SEGMENTS) {
        "Voice enrollment timed out. Try again in a quieter place and speak naturally."
      }

      profileStore.save(SherpaSpeakerEmbeddingEngine.average(embeddings))
      emitProgress(100)
      promise.resolve(statusMap())
    } catch (_: EnrollmentCancelledException) {
      promise.reject("ENROLLMENT_CANCELLED", "Voice enrollment was cancelled")
    } catch (error: Exception) {
      promise.reject("VOICE_ENROLLMENT_FAILED", error)
    } finally {
      enrollmentRunning = false
      enrollmentRecord = null
      try {
        record?.stop()
      } catch (_: IllegalStateException) {
      }
      record?.release()
      engine?.close()
      MicrophoneLease.release(ENROLLMENT_OWNER)
    }
  }

  private fun statusMap() =
    Arguments.createMap().apply {
      putBoolean("configured", SherpaSpeakerEmbeddingEngine.isAvailable(reactContext))
      putBoolean("enrolled", profileStore.hasProfile())
      putBoolean("enrolling", enrollmentRunning)
    }

  private fun emitProgress(progress: Int) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_PROGRESS, progress)
  }

  private fun stopEnrollment() {
    enrollmentRunning = false
    try {
      enrollmentRecord?.stop()
    } catch (_: IllegalStateException) {
    }
    if (enrollmentThread != Thread.currentThread()) enrollmentThread?.join(500)
    enrollmentThread = null
  }

  private fun hasSpeechEnergy(bytes: ByteArray, count: Int): Boolean {
    var total = 0.0
    var samples = 0
    var index = 0
    while (index + 1 < count) {
      val sample =
        ((bytes[index].toInt() and 0xff) or (bytes[index + 1].toInt() shl 8)).toShort().toDouble()
      total += sample * sample
      samples += 1
      index += 2
    }
    return samples > 0 && sqrt(total / samples) >= MIN_ENROLLMENT_RMS
  }

  override fun invalidate() {
    stopEnrollment()
    super.invalidate()
  }

  private class EnrollmentCancelledException : Exception()

  private companion object {
    const val SAMPLE_RATE = 16_000
    const val INPUT_CHUNK_BYTES = 1_280
    const val ENROLLMENT_SEGMENT_BYTES = SAMPLE_RATE * 2 * 5 / 2
    const val ENROLLMENT_SEGMENTS = 3
    const val MIN_ENROLLMENT_RMS = 300.0
    const val ENROLLMENT_TIMEOUT_MS = 90_000L
    const val ENROLLMENT_OWNER = "speaker-enrollment"
    const val EVENT_PROGRESS = "speakerEnrollmentProgress"
  }
}
