package com.englishdrive.audio

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** App-private, offline vocabulary, separated by authenticated user ID. */
class VocabularyStorageModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val preferences = context.getSharedPreferences("vocabulary_notebooks", Context.MODE_PRIVATE)
  override fun getName() = "VocabularyStorage"

  private fun accountKey(userId: String): String {
    require(userId.isNotBlank() && userId.length <= 128)
    return "user:$userId"
  }

  @ReactMethod
  fun read(userId: String, promise: Promise) {
    try {
      promise.resolve(preferences.getString(accountKey(userId), null))
    } catch (error: Exception) {
      promise.reject("VOCABULARY_READ_FAILED", "Không mở được sổ từ vựng", error)
    }
  }

  @ReactMethod
  fun write(userId: String, payload: String, promise: Promise) {
    try {
      require(payload.length <= 10_000_000)
      val key = accountKey(userId)
      val previous = preferences.getString(key, null)
      if (!preferences.edit().putString(key, payload).commit()) {
        // commit can update the in-memory map even if writing to disk failed.
        preferences.edit().putString(key, previous).commit()
        throw IllegalStateException("Vocabulary write failed")
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("VOCABULARY_WRITE_FAILED", "Không lưu được sổ từ vựng", error)
    }
  }
}
