package com.englishdrive.audio

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.os.Handler
import android.os.HandlerThread
import android.os.Process
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.concurrent.thread

class LiveAudioModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  @Volatile private var captureRunning = false
  @Volatile private var playbackGeneration = 0
  private var audioRecord: AudioRecord? = null
  private var acousticEchoCanceler: AcousticEchoCanceler? = null
  private var noiseSuppressor: NoiseSuppressor? = null
  private var automaticGainControl: AutomaticGainControl? = null
  private var captureThread: Thread? = null
  @Volatile private var audioTrack: AudioTrack? = null
  private val playbackThread = HandlerThread("englishdrive-live-playback").apply { start() }
  private val playbackHandler = Handler(playbackThread.looper)
  private val playbackLock = Any()
  private var voiceActivityDetector: AudioVoiceActivityDetector? = null
  private var targetSpeakerVerifier: TargetSpeakerVerifier? = null
  private var targetSpeakerGate: TargetSpeakerAudioGate? = null
  @Volatile private var filterBypassed = false
  private var rejectedSpeechChunks = 0
  private val echoGuard = PlaybackEchoGuard()
  private var protectSpeakerCapture = false
  private var suppressingEcho = false
  private var echoTailChunks = 0

  override fun getName() = "LiveAudio"

  @ReactMethod
  fun startCapture(promise: Promise) {
    if (captureRunning) {
      promise.resolve(null)
      return
    }
    if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject("MICROPHONE_PERMISSION_REQUIRED", "Microphone permission is required")
      return
    }
    if (!MicrophoneLease.acquire(CAPTURE_OWNER)) {
      promise.reject("MICROPHONE_BUSY", "The microphone is already in use")
      return
    }

    try {
      val route = SpeakerAudioRouteResolver.current(reactContext)
      protectSpeakerCapture = route.kind == SpeakerProfileKind.PHONE
      voiceActivityDetector?.close()
      voiceActivityDetector = StrictVoiceActivityDetector.createOrFallback(reactContext)
      val hasTargetProfile = SpeakerProfileStore(reactContext).hasProfile(route.kind)
      val filterAvailable =
        hasTargetProfile && SherpaSpeakerEmbeddingEngine.isAvailable(reactContext)
      if (filterAvailable) {
        targetSpeakerVerifier = TargetSpeakerVerifier.create(reactContext, route.kind)
        targetSpeakerGate =
          targetSpeakerVerifier?.let { verifier ->
            TargetSpeakerAudioGate(
              score = verifier::score,
              threshold = verifier.threshold,
              finishScore = verifier::finishScore,
            )
          }
      } else {
        targetSpeakerVerifier = null
        targetSpeakerGate = null
      }
      Log.i(
        TAG,
        "Target speaker filter enabled=${targetSpeakerGate != null} " +
          "profile=${route.kind.storageName} route=${route.type}/${route.name}",
      )
      val minBuffer =
        AudioRecord.getMinBufferSize(
          INPUT_SAMPLE_RATE,
          AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT,
        )
      val record =
        AudioRecord.Builder()
          .setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
          .setAudioFormat(
            AudioFormat.Builder()
              .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
              .setSampleRate(INPUT_SAMPLE_RATE)
              .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
              .build(),
          )
          .setBufferSizeInBytes(maxOf(minBuffer, INPUT_CHUNK_BYTES * 4))
          .build()
      if (record.state != AudioRecord.STATE_INITIALIZED) {
        record.release()
        stopCaptureInternal()
        promise.reject("AUDIO_RECORD_INIT_FAILED", "Could not initialize microphone capture")
        return
      }

      audioRecord = record
      configureCaptureEffects(record)
      captureRunning = true
      filterBypassed = false
      rejectedSpeechChunks = 0
      suppressingEcho = false
      echoTailChunks = 0
      voiceActivityDetector?.reset()
      record.startRecording()
      captureThread =
        thread(start = true, name = "englishdrive-live-capture") {
          Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
          captureLoop(record)
        }
      promise.resolve(null)
    } catch (error: Exception) {
      stopCaptureInternal()
      promise.reject("AUDIO_CAPTURE_START_FAILED", error)
    }
  }

  @ReactMethod
  fun stopCapture(promise: Promise) {
    stopCaptureInternal()
    promise.resolve(null)
  }

  @ReactMethod
  fun startPlayback(promise: Promise) {
    synchronized(playbackLock) {
      if (audioTrack?.state == AudioTrack.STATE_INITIALIZED) {
        promise.resolve(null)
        return
      }
      try {
        val minBuffer =
          AudioTrack.getMinBufferSize(
            OUTPUT_SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
          )
        val track =
          AudioTrack.Builder()
            .setAudioAttributes(
              AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
            )
            .setAudioFormat(
              AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(OUTPUT_SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build(),
            )
          .setBufferSizeInBytes(maxOf(minBuffer, OUTPUT_SAMPLE_RATE * 2 / 5))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        if (track.state != AudioTrack.STATE_INITIALIZED) {
          track.release()
          promise.reject("AUDIO_TRACK_INIT_FAILED", "Could not initialize audio playback")
          return
        }
        audioTrack = track
        echoGuard.reset()
        track.play()
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("AUDIO_PLAYBACK_START_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun enqueuePlayback(base64Pcm: String) {
    val generation = playbackGeneration
    val bytes =
      try {
        Base64.decode(base64Pcm, Base64.DEFAULT)
      } catch (error: IllegalArgumentException) {
        emit(EVENT_ERROR, "Gemini returned invalid base64 audio")
        return
      }
    playbackHandler.post {
      if (generation != playbackGeneration) return@post
      val track = audioTrack ?: return@post
      if (generation == playbackGeneration) {
        try {
          var offset = 0
          while (offset < bytes.size && generation == playbackGeneration) {
            val written = synchronized(playbackLock) {
              if (generation != playbackGeneration) return@post
              val count = track.write(bytes, offset, bytes.size - offset, AudioTrack.WRITE_BLOCKING)
              if (count > 0) echoGuard.append(bytes, offset, count)
              count
            }
            if (written <= 0) break
            offset += written
          }
        } catch (_: IllegalStateException) {
        }
      }
    }
  }

  @ReactMethod
  fun clearPlayback() {
    playbackGeneration += 1
    playbackHandler.removeCallbacksAndMessages(null)
    synchronized(playbackLock) {
      val track = audioTrack ?: return
      try {
        track.pause()
        track.flush()
        echoGuard.reset()
        track.play()
      } catch (_: IllegalStateException) {
      }
    }
  }

  @ReactMethod
  fun stopPlayback(promise: Promise) {
    stopPlaybackInternal()
    promise.resolve(null)
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun captureLoop(record: AudioRecord) {
    val buffer = ByteArray(INPUT_CHUNK_BYTES)
    while (captureRunning) {
      val count = record.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
      if (count <= 0 || !captureRunning) continue
      val chunk = if (count == buffer.size) buffer else buffer.copyOf(count)
      val detector = voiceActivityDetector ?: continue
      val rendered = try {
        audioTrack?.playbackHeadPosition?.toLong()?.and(0xffffffffL) ?: 0L
      } catch (_: IllegalStateException) { 0L }
      val echo = protectSpeakerCapture && echoGuard.isEcho(chunk, rendered)
      if (echo) echoTailChunks = 2 else echoTailChunks = (echoTailChunks - 1).coerceAtLeast(0)
      if (echo) {
        if (!suppressingEcho) {
          // Never train VAD, speaker embeddings or the bypass counter on AI playback.
          if (detector.isSpeaking) emit(EVENT_ACTIVITY, false)
          detector.reset()
          targetSpeakerGate?.reset()
          targetSpeakerVerifier?.resetTurn()
          rejectedSpeechChunks = 0
          Log.d(TAG, "Residual playback echo suppressed")
        }
        suppressingEcho = true
        continue
      }
      // Discard only the first trailing frame; a new independent voice is then evaluated normally.
      if (suppressingEcho && echoTailChunks > 0) continue
      suppressingEcho = false
      val activityChange = detector.processPcm16(chunk)
      if (com.englishdrive.BuildConfig.DEBUG && activityChange != null) {
        Log.d(
          TAG,
            "Local speech activity=$activityChange rms=${detector.lastRms} " +
            "threshold=${detector.currentThreshold}",
        )
      }
      val gate = targetSpeakerGate
      if (gate == null || filterBypassed) {
        emitAudioChunk(chunk)
        activityChange?.let { emit(EVENT_ACTIVITY, it) }
      } else {
        if (activityChange == true) targetSpeakerVerifier?.resetTurn()
        val result = gate.process(chunk, detector.isSpeaking, activityChange)
        if (result.started) {
          rejectedSpeechChunks = 0
          emit(EVENT_ACTIVITY, true)
        } else if (detector.isSpeaking && result.chunks.isEmpty()) {
          // The learner is clearly speaking but nothing matches the stored
          // profile. Holding the gate closed here silently mutes the entire
          // session, so after a sustained run of rejections forward audio again
          // and tell the app the filter was bypassed.
          rejectedSpeechChunks += 1
          if (rejectedSpeechChunks >= FILTER_BYPASS_CHUNKS) {
            filterBypassed = true
            rejectedSpeechChunks = 0
            Log.w(
              TAG,
              "Voice filter bypassed after $FILTER_BYPASS_CHUNKS rejected speech chunks " +
                "profile=${targetSpeakerVerifier?.profileKind?.storageName}",
            )
            emit(EVENT_FILTER_BYPASSED, true)
          }
        } else if (!detector.isSpeaking) {
          rejectedSpeechChunks = 0
        }
        result.chunks.forEach(::emitAudioChunk)
        if (result.activity == false) emit(EVENT_ACTIVITY, false)
        if (com.englishdrive.BuildConfig.DEBUG && activityChange == false) {
          Log.d(
            TAG,
            "Speaker turn profile=${targetSpeakerVerifier?.profileKind?.storageName} " +
              "result=${result.reason} confidence=${result.confidence}",
          )
        }
      }
    }
  }

  private fun emitAudioChunk(chunk: ByteArray) {
    val event = Arguments.createMap().apply {
      putString("data", Base64.encodeToString(chunk, Base64.NO_WRAP))
      putString("mimeType", "audio/pcm;rate=$INPUT_SAMPLE_RATE")
    }
    emit(EVENT_CHUNK, event)
  }

  private fun configureCaptureEffects(record: AudioRecord) {
    releaseCaptureEffects()
    acousticEchoCanceler =
      createEffect("AEC", AcousticEchoCanceler.isAvailable()) {
        AcousticEchoCanceler.create(record.audioSessionId)
      }
    noiseSuppressor =
      createEffect("NS", NoiseSuppressor.isAvailable()) {
        NoiseSuppressor.create(record.audioSessionId)
      }
    // Quiet utterances produced meaningless speaker embeddings, so normalize the
    // level here and in enrollment instead of trusting a consistent speaking voice.
    automaticGainControl =
      createEffect("AGC", AutomaticGainControl.isAvailable()) {
        AutomaticGainControl.create(record.audioSessionId)
      }
    Log.i(
      TAG,
      "Capture effects: aec=${acousticEchoCanceler?.enabled == true}, " +
        "ns=${noiseSuppressor?.enabled == true}, " +
        "agc=${automaticGainControl?.enabled == true}",
    )
  }

  private fun <T : android.media.audiofx.AudioEffect> createEffect(
    name: String,
    available: Boolean,
    create: () -> T?,
  ): T? {
    if (!available) {
      Log.i(TAG, "$name unavailable")
      return null
    }
    return try {
      create()?.apply { enabled = true }
    } catch (error: RuntimeException) {
      Log.w(TAG, "$name could not be enabled", error)
      null
    }
  }

  private fun releaseCaptureEffects() {
    automaticGainControl?.release()
    automaticGainControl = null
    acousticEchoCanceler?.release()
    acousticEchoCanceler = null
    noiseSuppressor?.release()
    noiseSuppressor = null
  }

  private fun stopCaptureInternal() {
    captureRunning = false
    val record = audioRecord
    audioRecord = null
    try {
      record?.stop()
    } catch (_: IllegalStateException) {
    }
    if (captureThread != Thread.currentThread()) captureThread?.join(500)
    captureThread = null
    releaseCaptureEffects()
    record?.release()
    filterBypassed = false
    rejectedSpeechChunks = 0
    suppressingEcho = false
    echoTailChunks = 0
    if (voiceActivityDetector?.isSpeaking == true) emit(EVENT_ACTIVITY, false)
    voiceActivityDetector?.close()
    voiceActivityDetector = null
    targetSpeakerGate?.reset()
    targetSpeakerGate = null
    targetSpeakerVerifier?.close()
    targetSpeakerVerifier = null
    MicrophoneLease.release(CAPTURE_OWNER)
  }

  private fun stopPlaybackInternal() {
    playbackGeneration += 1
    playbackHandler.removeCallbacksAndMessages(null)
    synchronized(playbackLock) {
      try {
        audioTrack?.pause()
        audioTrack?.flush()
        audioTrack?.stop()
      } catch (_: IllegalStateException) {
      }
      audioTrack?.release()
      audioTrack = null
      echoGuard.reset()
    }
  }

  private fun emit(eventName: String, value: Any?) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, value)
  }

  override fun invalidate() {
    stopCaptureInternal()
    stopPlaybackInternal()
    playbackThread.quitSafely()
    super.invalidate()
  }

  companion object {
    private const val INPUT_SAMPLE_RATE = 16_000
    private const val OUTPUT_SAMPLE_RATE = 24_000
    // 40 ms of PCM16 mono at 16 kHz. Short chunks reduce conversational latency.
    private const val INPUT_CHUNK_BYTES = 1_280
    private const val TAG = "EnglishDriveAudio"
    private const val CAPTURE_OWNER = "live-conversation"
    const val EVENT_CHUNK = "liveAudioChunk"
    const val EVENT_ACTIVITY = "liveAudioActivity"
    const val EVENT_ERROR = "liveAudioError"
    const val EVENT_FILTER_BYPASSED = "liveAudioFilterBypassed"
    private const val FILTER_BYPASS_CHUNKS = 125
  }
}
