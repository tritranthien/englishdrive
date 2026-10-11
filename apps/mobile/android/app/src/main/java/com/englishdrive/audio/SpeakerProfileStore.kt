package com.englishdrive.audio

import android.content.Context
import android.content.SharedPreferences
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.util.Base64
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.json.JSONArray
import org.json.JSONObject

internal enum class SpeakerProfileKind(val storageName: String) {
  PHONE("phone"),
  HEADSET("headset");

  companion object {
    fun fromValue(value: String): SpeakerProfileKind =
      entries.firstOrNull { it.storageName.equals(value, ignoreCase = true) }
        ?: throw IllegalArgumentException("Unknown speaker profile: $value")

    fun fromRouteType(routeType: String): SpeakerProfileKind =
      if (routeType == "bluetooth" || routeType == "wired") HEADSET else PHONE
  }
}

internal data class SpeakerAudioRoute(
  val kind: SpeakerProfileKind,
  val type: String,
  val name: String,
)

internal data class SpeakerProfile(
  val kind: SpeakerProfileKind,
  val embeddings: List<FloatArray>,
  val threshold: Float,
  val routeType: String,
  val routeName: String,
)

internal object SpeakerAudioRouteResolver {
  fun current(context: Context): SpeakerAudioRoute {
    val manager = context.getSystemService(AudioManager::class.java)
    val communicationDevice =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) manager.communicationDevice else null
    val availableInputs = manager.getDevices(AudioManager.GET_DEVICES_INPUTS)
    val inputDevice =
      communicationDevice?.takeIf(::isHeadset)
        ?: availableInputs.firstOrNull(::isHeadset)
        ?: communicationDevice
        ?: availableInputs.firstOrNull {
          it.type == AudioDeviceInfo.TYPE_BUILTIN_MIC
        }
    val type = routeType(inputDevice)
    return SpeakerAudioRoute(
      kind = SpeakerProfileKind.fromRouteType(type),
      type = type,
      name = inputDevice?.productName?.toString() ?: "Phone",
    )
  }

  fun isHeadset(device: AudioDeviceInfo): Boolean =
    device.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
      device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
      device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
      device.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
      device.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
      device.type == AudioDeviceInfo.TYPE_USB_HEADSET

  fun routeType(device: AudioDeviceInfo?): String =
    when (device?.type) {
      AudioDeviceInfo.TYPE_BLE_HEADSET,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth"
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_USB_HEADSET -> "wired"
      else -> "phone"
    }
}

internal class SpeakerProfileStore(private val preferences: SharedPreferences) {
  constructor(context: Context) : this(context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE))

  fun manualThreshold(kind: SpeakerProfileKind): Float? =
    if (preferences.contains("threshold_${kind.storageName}"))
      preferences.getFloat("threshold_${kind.storageName}", 0f) else null

  fun thresholdRevision(kind: SpeakerProfileKind): Long =
    preferences.getLong("threshold_revision_${kind.storageName}", 0L)

  fun setThreshold(kind: SpeakerProfileKind, value: Float?) {
    require(value == null || (value.isFinite() && value in 0f..1f)) { "Threshold must be between 0 and 1" }
    val previous = manualThreshold(kind)
    val revision = thresholdRevision(kind)
    val editor = preferences.edit()
    if (value == null) editor.remove("threshold_${kind.storageName}")
    else editor.putFloat("threshold_${kind.storageName}", value)
    if (!editor.putLong("threshold_revision_${kind.storageName}", revision + 1).commit()) {
      // Android updates in-memory preferences even when the disk commit fails.
      val rollback = preferences.edit().putLong("threshold_revision_${kind.storageName}", revision)
      if (previous == null) rollback.remove("threshold_${kind.storageName}")
      else rollback.putFloat("threshold_${kind.storageName}", previous)
      rollback.commit()
      error("Could not save voice threshold")
    }
  }

  fun hasProfile(kind: SpeakerProfileKind): Boolean = load(kind) != null

  fun hasLegacyProfile(): Boolean =
    SpeakerProfileKind.entries.any { preferences.contains(keyFor(it)) && load(it) == null } ||
    preferences.contains(LEGACY_V3_PHONE_KEY) ||
      preferences.contains(LEGACY_V3_HEADSET_KEY) ||
      preferences.contains(LEGACY_V2_PROFILE_KEY) ||
      preferences.contains(LEGACY_PROFILE_KEY)

  fun load(kind: SpeakerProfileKind): SpeakerProfile? {
    val encoded = preferences.getString(keyFor(kind), null) ?: return null
    return try {
      val json = JSONObject(encoded)
      // A profile captured through an older capture chain describes a different
      // signal than the one sessions produce now, so reusing it would reject the
      // learner's own voice.
      if (json.optInt("capturePipeline", 0) != CAPTURE_PIPELINE) {
        Log.i(
          TAG,
          "Speaker profile ${kind.storageName} predates capture pipeline " +
            "$CAPTURE_PIPELINE; re-enrollment required",
        )
        return null
      }
      val embeddingsJson = json.getJSONArray("embeddings")
      val embeddings =
        buildList {
          for (index in 0 until embeddingsJson.length()) {
            decodeEmbedding(embeddingsJson.getString(index))?.let(::add)
          }
        }
      if (embeddings.isEmpty() || embeddings.any { it.size != embeddings.first().size }) return null
      SpeakerProfile(
        kind = kind,
        embeddings = embeddings,
        threshold = json.optDouble("threshold", DEFAULT_THRESHOLD.toDouble()).toFloat(),
        routeType = json.optString("routeType", kind.storageName),
        routeName = json.optString("routeName", kind.storageName),
      )
    } catch (_: Exception) {
      null
    }
  }

  fun save(profile: SpeakerProfile) {
    require(profile.embeddings.isNotEmpty()) { "At least one speaker embedding is required" }
    val embeddings = JSONArray()
    profile.embeddings.forEach { embeddings.put(encodeEmbedding(it)) }
    val json =
      JSONObject()
        .put("version", PROFILE_VERSION)
        .put("capturePipeline", CAPTURE_PIPELINE)
        .put("model", SherpaSpeakerEmbeddingEngine.MODEL_ASSET)
        .put("embeddings", embeddings)
        .put("threshold", profile.threshold.toDouble())
        .put("routeType", profile.routeType)
        .put("routeName", profile.routeName)
    preferences.edit().putString(keyFor(profile.kind), json.toString()).apply()
  }

  fun clear(kind: SpeakerProfileKind) {
    val profile = preferences.getString(keyFor(kind), null)
    val manual = manualThreshold(kind)
    val revision = thresholdRevision(kind)
    if (!preferences.edit().remove(keyFor(kind)).remove("threshold_${kind.storageName}")
      .putLong("threshold_revision_${kind.storageName}", revision + 1).commit()) {
      val rollback = preferences.edit().putString(keyFor(kind), profile)
        .putLong("threshold_revision_${kind.storageName}", revision)
      if (manual != null) rollback.putFloat("threshold_${kind.storageName}", manual)
      rollback.commit()
      error("Could not delete voice profile")
    }
  }

  fun clearLegacy() =
    preferences
      .edit()
      .remove(LEGACY_V3_PHONE_KEY)
      .remove(LEGACY_V3_HEADSET_KEY)
      .remove(LEGACY_V2_PROFILE_KEY)
      .remove(LEGACY_PROFILE_KEY)
      .apply()

  private fun keyFor(kind: SpeakerProfileKind) = "$PROFILE_KEY_PREFIX${kind.storageName}"

  private fun encodeEmbedding(profile: FloatArray): String {
    require(profile.isNotEmpty()) { "Speaker embedding cannot be empty" }
    val buffer = ByteBuffer.allocate(profile.size * Float.SIZE_BYTES).order(ByteOrder.LITTLE_ENDIAN)
    profile.forEach(buffer::putFloat)
    return Base64.encodeToString(buffer.array(), Base64.NO_WRAP)
  }

  private fun decodeEmbedding(encoded: String): FloatArray? {
    return try {
      val bytes = Base64.decode(encoded, Base64.NO_WRAP)
      if (bytes.isEmpty() || bytes.size % Float.SIZE_BYTES != 0) return null
      val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
      FloatArray(bytes.size / Float.SIZE_BYTES) { buffer.float }
    } catch (_: IllegalArgumentException) {
      null
    }
  }

  private companion object {
    const val PREFERENCES_NAME = "englishdrive_speaker_verification"
    const val PROFILE_KEY_PREFIX = "target_speaker_profile_v4_"
    const val PROFILE_VERSION = 4
    // Bumped whenever the capture chain changes enough to shift embeddings:
    // 3 = high-pass filtering in both enrollment and scoring.
    const val CAPTURE_PIPELINE = 3
    const val TAG = "EnglishDriveAudio"
    const val DEFAULT_THRESHOLD = 0.36f
    const val LEGACY_V2_PROFILE_KEY = "target_speaker_embedding_v2"
    const val LEGACY_PROFILE_KEY = "target_speaker_profile"
    const val LEGACY_V3_PHONE_KEY = "target_speaker_profile_v3_phone"
    const val LEGACY_V3_HEADSET_KEY = "target_speaker_profile_v3_headset"
  }
}
