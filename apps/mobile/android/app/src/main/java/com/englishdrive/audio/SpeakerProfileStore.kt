package com.englishdrive.audio

import android.content.Context
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

internal class SpeakerProfileStore(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  fun hasProfile(kind: SpeakerProfileKind): Boolean = load(kind) != null

  fun hasLegacyProfile(): Boolean =
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

  fun clear(kind: SpeakerProfileKind) = preferences.edit().remove(keyFor(kind)).apply()

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
    // 1 = AEC + noise suppression, 2 = adds AGC and high-passed scoring.
    const val CAPTURE_PIPELINE = 2
    const val TAG = "EnglishDriveAudio"
    const val DEFAULT_THRESHOLD = 0.36f
    const val LEGACY_V2_PROFILE_KEY = "target_speaker_embedding_v2"
    const val LEGACY_PROFILE_KEY = "target_speaker_profile"
    const val LEGACY_V3_PHONE_KEY = "target_speaker_profile_v3_phone"
    const val LEGACY_V3_HEADSET_KEY = "target_speaker_profile_v3_headset"
  }
}
