package com.englishdrive.audio

import android.content.SharedPreferences
import java.lang.reflect.Proxy
import org.junit.Assert.*
import org.junit.Test

class SpeakerThresholdStoreTest {
  private val values = mutableMapOf<String, Any>()
  private var failCommit = false
  private fun preferences(): SharedPreferences {
    val edits = mutableMapOf<String, Any?>()
    lateinit var editor: SharedPreferences.Editor
    editor = Proxy.newProxyInstance(javaClass.classLoader, arrayOf(SharedPreferences.Editor::class.java)) { _, method, args ->
      when (method.name) {
        "putFloat", "putLong", "putString" -> { edits[args!![0] as String] = args[1]; editor }
        "remove" -> { edits[args!![0] as String] = null; editor }
        "commit", "apply" -> {
          // Like Android, memory changes even if persistence returns false.
          edits.forEach { (key, value) -> if (value == null) values.remove(key) else values[key] = value }
          edits.clear()
          if (method.name == "commit") !failCommit else null
        }
        else -> throw UnsupportedOperationException(method.name)
      }
    } as SharedPreferences.Editor
    return Proxy.newProxyInstance(javaClass.classLoader, arrayOf(SharedPreferences::class.java)) { _, method, args ->
      when (method.name) {
        "contains" -> values.containsKey(args!![0] as String)
        "getFloat", "getLong", "getString" -> values[args!![0] as String] ?: args[1]
        "edit" -> editor
        else -> throw UnsupportedOperationException(method.name)
      }
    } as SharedPreferences
  }

  @Test fun `thresholds persist independently across store instances and restore automatic`() {
    val store = SpeakerProfileStore(preferences())
    assertNull(store.manualThreshold(SpeakerProfileKind.PHONE))
    store.setThreshold(SpeakerProfileKind.PHONE, 0.8f)
    store.setThreshold(SpeakerProfileKind.HEADSET, 0.05f)
    val reopened = SpeakerProfileStore(preferences())
    assertEquals(0.8f, reopened.manualThreshold(SpeakerProfileKind.PHONE)!!, 0.0001f)
    assertEquals(0.05f, reopened.manualThreshold(SpeakerProfileKind.HEADSET)!!, 0.0001f)
    // Enrollment writes only the profile key, keeping the mic's override intact.
    preferences().edit().putString("target_speaker_profile_v4_phone", "new enrollment").commit()
    assertEquals(0.8f, reopened.manualThreshold(SpeakerProfileKind.PHONE)!!, 0.0001f)
    reopened.setThreshold(SpeakerProfileKind.PHONE, null)
    assertNull(reopened.manualThreshold(SpeakerProfileKind.PHONE))
    assertEquals(2L, reopened.thresholdRevision(SpeakerProfileKind.PHONE))
    reopened.clear(SpeakerProfileKind.HEADSET)
    assertNull(reopened.manualThreshold(SpeakerProfileKind.HEADSET))
    reopened.clear(SpeakerProfileKind.PHONE)
    assertFalse(values.containsKey("target_speaker_profile_v4_phone"))
  }

  @Test fun `invalid values and failed writes do not report success`() {
    val store = SpeakerProfileStore(preferences())
    for (invalid in listOf(-0.01f, 1.01f, Float.NaN, Float.POSITIVE_INFINITY)) {
      assertThrows(IllegalArgumentException::class.java) { store.setThreshold(SpeakerProfileKind.PHONE, invalid) }
    }
    store.setThreshold(SpeakerProfileKind.PHONE, 0.4f)
    failCommit = true
    assertThrows(IllegalStateException::class.java) { store.setThreshold(SpeakerProfileKind.PHONE, 0.8f) }
    assertEquals(0.4f, store.manualThreshold(SpeakerProfileKind.PHONE)!!, 0.0001f)
    assertEquals(1L, store.thresholdRevision(SpeakerProfileKind.PHONE))
    assertThrows(IllegalStateException::class.java) { store.clear(SpeakerProfileKind.PHONE) }
    assertEquals(0.4f, store.manualThreshold(SpeakerProfileKind.PHONE)!!, 0.0001f)
  }
}
