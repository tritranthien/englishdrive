package com.englishdrive.audio

import android.content.Context
import android.util.Base64
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal class SpeakerProfileStore(context: Context) {
  private val preferences =
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  fun hasProfile(): Boolean = preferences.contains(PROFILE_KEY)

  fun load(): FloatArray? {
    val encoded = preferences.getString(PROFILE_KEY, null) ?: return null
    return try {
      val bytes = Base64.decode(encoded, Base64.NO_WRAP)
      if (bytes.isEmpty() || bytes.size % Float.SIZE_BYTES != 0) return null
      val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
      FloatArray(bytes.size / Float.SIZE_BYTES) { buffer.float }
    } catch (_: IllegalArgumentException) {
      null
    }
  }

  fun save(profile: FloatArray) {
    require(profile.isNotEmpty()) { "Speaker embedding cannot be empty" }
    val buffer = ByteBuffer.allocate(profile.size * Float.SIZE_BYTES).order(ByteOrder.LITTLE_ENDIAN)
    profile.forEach(buffer::putFloat)
    val encoded = Base64.encodeToString(buffer.array(), Base64.NO_WRAP)
    preferences.edit().putString(PROFILE_KEY, encoded).remove(LEGACY_PROFILE_KEY).apply()
  }

  fun clear() = preferences.edit().remove(PROFILE_KEY).remove(LEGACY_PROFILE_KEY).apply()

  private companion object {
    const val PREFERENCES_NAME = "englishdrive_speaker_verification"
    const val PROFILE_KEY = "target_speaker_embedding_v2"
    const val LEGACY_PROFILE_KEY = "target_speaker_profile"
  }
}
