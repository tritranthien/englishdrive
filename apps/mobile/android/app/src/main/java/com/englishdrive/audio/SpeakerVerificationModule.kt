package com.englishdrive.audio

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.Process
import android.util.Log
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
  @Volatile private var enrollmentKind: SpeakerProfileKind? = null
  private var enrollmentThread: Thread? = null
  private val profileStore = SpeakerProfileStore(reactContext)

  override fun getName() = "SpeakerVerification"

  @ReactMethod
  fun getStatus(promise: Promise) = promise.resolve(statusMap())

  @ReactMethod
  fun startEnrollment(kindValue: String, promise: Promise) {
    val requestedKind =
      try {
        SpeakerProfileKind.fromValue(kindValue)
      } catch (error: IllegalArgumentException) {
        promise.reject("INVALID_PROFILE_KIND", error)
        return
      }
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
    enrollmentKind = requestedKind
    enrollmentThread =
      thread(start = true, name = "englishdrive-speaker-enrollment") {
        Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
        runEnrollment(requestedKind, promise)
      }
  }

  @ReactMethod
  fun cancelEnrollment(promise: Promise) {
    stopEnrollment()
    promise.resolve(statusMap())
  }

  @ReactMethod
  fun deleteProfile(kindValue: String, promise: Promise) {
    if (enrollmentRunning) {
      promise.reject("ENROLLMENT_ACTIVE", "Cancel voice enrollment first")
      return
    }
    val kind =
      try {
        SpeakerProfileKind.fromValue(kindValue)
      } catch (error: IllegalArgumentException) {
        promise.reject("INVALID_PROFILE_KIND", error)
        return
      }
    profileStore.clear(kind)
    promise.resolve(statusMap())
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun runEnrollment(requestedKind: SpeakerProfileKind, promise: Promise) {
    var engine: SherpaSpeakerEmbeddingEngine? = null
    var record: AudioRecord? = null
    var acousticEchoCanceler: AcousticEchoCanceler? = null
    var noiseSuppressor: NoiseSuppressor? = null
    var automaticGainControl: AutomaticGainControl? = null
    val audioManager = reactContext.getSystemService(AudioManager::class.java)
    val previousAudioMode = audioManager.mode
    val previousCommunicationDevice =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) audioManager.communicationDevice else null
    try {
      engine = SherpaSpeakerEmbeddingEngine(reactContext)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val desiredDevice =
          audioManager.availableCommunicationDevices.firstOrNull { device ->
            deviceMatchesProfile(device, requestedKind)
          }
        check(desiredDevice != null) {
          if (requestedKind == SpeakerProfileKind.HEADSET) {
            "Connect your headset before enrolling the headset profile."
          } else {
            "Disconnect your headset before enrolling the phone profile."
          }
        }
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        check(audioManager.setCommunicationDevice(desiredDevice)) {
          "Could not route the microphone for voice enrollment."
        }
      }

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
      acousticEchoCanceler =
        if (AcousticEchoCanceler.isAvailable()) {
          try {
            AcousticEchoCanceler.create(record.audioSessionId)?.apply { enabled = true }
          } catch (_: RuntimeException) {
            null
          }
        } else null
      noiseSuppressor =
        if (NoiseSuppressor.isAvailable()) {
          try {
            NoiseSuppressor.create(record.audioSessionId)?.apply { enabled = true }
          } catch (_: RuntimeException) {
            null
          }
        } else null
      // Enrollment must run through the same capture chain as a live session,
      // AGC included, or the stored embeddings describe a different signal.
      automaticGainControl =
        if (AutomaticGainControl.isAvailable()) {
          try {
            AutomaticGainControl.create(record.audioSessionId)?.apply { enabled = true }
          } catch (_: RuntimeException) {
            null
          }
        } else null
      Log.i(
        TAG,
        "Enrollment capture effects: aec=${acousticEchoCanceler?.enabled == true}, " +
          "ns=${noiseSuppressor?.enabled == true}, " +
          "agc=${automaticGainControl?.enabled == true}",
      )
      enrollmentRecord = record

      val route = SpeakerAudioRouteResolver.current(reactContext)
      check(route.kind == requestedKind) {
        if (requestedKind == SpeakerProfileKind.HEADSET) {
          "Connect your headset before enrolling the headset profile."
        } else {
          "Disconnect your headset before enrolling the phone profile."
        }
      }

      val segment = ByteArrayOutputStream(ENROLLMENT_SEGMENT_BYTES)
      val embeddings = mutableListOf<FloatArray>()
      val segmentLevels = mutableListOf<Double>()
      var segmentSquareSum = 0.0
      var segmentSamples = 0
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
        val rms = speechRms(buffer, count) ?: continue
        segmentSquareSum += rms * rms
        segmentSamples += 1

        val remaining = ENROLLMENT_SEGMENT_BYTES - segment.size()
        segment.write(buffer, 0, minOf(count, remaining))
        if (segment.size() >= ENROLLMENT_SEGMENT_BYTES) {
          embeddings += engine.compute(segment.toByteArray())
          segmentLevels +=
            if (segmentSamples == 0) 0.0 else sqrt(segmentSquareSum / segmentSamples)
          segmentSquareSum = 0.0
          segmentSamples = 0
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

      val consistency = TargetSpeakerVerifier.enrollmentBaseline(embeddings)
      val threshold = TargetSpeakerVerifier.calibratedThreshold(embeddings, requestedKind)
      Log.i(
        TAG,
        "Enrollment kind=${requestedKind.storageName} route=${route.type}/${route.name} " +
          "segmentRms=$segmentLevels consistency=$consistency threshold=$threshold",
      )
      // Segments that disagree with each other were captured badly. Saving that
      // profile would silently mute the learner on every later session.
      check(consistency >= MIN_ENROLLMENT_CONSISTENCY) {
        "Voice enrollment was unclear. Move closer to the phone, keep quiet around you, and speak naturally for the whole capture."
      }

      profileStore.save(
        SpeakerProfile(
          kind = requestedKind,
          embeddings = embeddings,
          threshold = threshold,
          routeType = route.type,
          routeName = route.name,
        ),
      )
      if (
        profileStore.hasProfile(SpeakerProfileKind.PHONE) &&
          profileStore.hasProfile(SpeakerProfileKind.HEADSET)
      ) {
        profileStore.clearLegacy()
      }
      emitProgress(100)
      enrollmentRunning = false
      enrollmentKind = null
      promise.resolve(statusMap())
    } catch (_: EnrollmentCancelledException) {
      promise.reject("ENROLLMENT_CANCELLED", "Voice enrollment was cancelled")
    } catch (error: Exception) {
      promise.reject("VOICE_ENROLLMENT_FAILED", error)
    } finally {
      enrollmentRunning = false
      enrollmentKind = null
      enrollmentRecord = null
      try {
        record?.stop()
      } catch (_: IllegalStateException) {
      }
      automaticGainControl?.release()
      acousticEchoCanceler?.release()
      noiseSuppressor?.release()
      record?.release()
      engine?.close()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        if (previousCommunicationDevice == null) audioManager.clearCommunicationDevice()
        else audioManager.setCommunicationDevice(previousCommunicationDevice)
      }
      audioManager.mode = previousAudioMode
      MicrophoneLease.release(ENROLLMENT_OWNER)
    }
  }

  private fun deviceMatchesProfile(device: AudioDeviceInfo, kind: SpeakerProfileKind): Boolean =
    if (kind == SpeakerProfileKind.HEADSET) {
      SpeakerAudioRouteResolver.isHeadset(device)
    } else {
      // CommuteAudioService routes the phone profile through the built-in
      // loudspeaker, so enrollment must capture through that same route.
      // Capturing through the earpiece instead produced embeddings from a
      // different microphone path, and the saved profile then rejected the
      // learner's own voice on every real session.
      device.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
    }

  private fun statusMap() =
    Arguments.createMap().apply {
      putBoolean("configured", SherpaSpeakerEmbeddingEngine.isAvailable(reactContext))
      putBoolean("phoneEnrolled", profileStore.hasProfile(SpeakerProfileKind.PHONE))
      putBoolean("headsetEnrolled", profileStore.hasProfile(SpeakerProfileKind.HEADSET))
      putBoolean("needsReenrollment", profileStore.hasLegacyProfile())
      putBoolean("enrolling", enrollmentRunning)
      putString("enrollingKind", enrollmentKind?.storageName)
      putString("currentRouteKind", SpeakerAudioRouteResolver.current(reactContext).kind.storageName)
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

  /** Returns the chunk RMS when it carries enough speech energy to enroll with. */
  private fun speechRms(bytes: ByteArray, count: Int): Double? {
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
    if (samples == 0) return null
    val rms = sqrt(total / samples)
    return if (rms >= MIN_ENROLLMENT_RMS) rms else null
  }

  override fun invalidate() {
    stopEnrollment()
    super.invalidate()
  }

  private class EnrollmentCancelledException : Exception()

  private companion object {
    const val SAMPLE_RATE = 16_000
    const val INPUT_CHUNK_BYTES = 1_280
    const val ENROLLMENT_SEGMENT_BYTES = SAMPLE_RATE * 2 * 2
    const val ENROLLMENT_SEGMENTS = 5
    const val MIN_ENROLLMENT_RMS = 300.0
    const val ENROLLMENT_TIMEOUT_MS = 90_000L
    const val ENROLLMENT_OWNER = "speaker-enrollment"
    const val EVENT_PROGRESS = "speakerEnrollmentProgress"
    const val MIN_ENROLLMENT_CONSISTENCY = 0.30
    const val TAG = "EnglishDriveAudio"
  }
}
