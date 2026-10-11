package com.englishdrive.audio

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Only the session is persisted; passwords never enter this module. */
class AuthSessionModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val preferences = context.getSharedPreferences("auth_session", Context.MODE_PRIVATE)
  private val keyAlias = "englishdrive.auth.session"

  override fun getName() = "AuthSession"

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(keyAlias, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build())
    }.generateKey()
  }

  @ReactMethod
  fun save(session: String, promise: Promise) {
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, key())
      val encrypted = cipher.doFinal(session.toByteArray(Charsets.UTF_8))
      check(preferences.edit()
        .putString("data", Base64.encodeToString(encrypted, Base64.NO_WRAP))
        .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
        .commit())
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SESSION_SAVE_FAILED", "Không lưu được phiên đăng nhập", error)
    }
  }

  @ReactMethod
  fun restore(promise: Promise) {
    try {
      val data = preferences.getString("data", null)
      if (data == null) {
        promise.resolve(null)
        return
      }
      val iv = requireNotNull(preferences.getString("iv", null))
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
      val session = String(cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)), Charsets.UTF_8)
      val token = JSONObject(session).getString("accessToken")
      val payload = JSONObject(String(Base64.decode(token.split('.')[1], Base64.URL_SAFE or Base64.NO_WRAP), Charsets.UTF_8))
      if (payload.getLong("exp") <= System.currentTimeMillis() / 1000) {
        check(preferences.edit().clear().commit())
        promise.resolve(null)
      } else {
        promise.resolve(session)
      }
    } catch (error: Exception) {
      // An expired/invalidated Keystore key or corrupt session requires a fresh login.
      if (preferences.edit().clear().commit()) promise.resolve(null)
      else promise.reject("SESSION_RESTORE_FAILED", "Không khôi phục được phiên đăng nhập", error)
    }
  }

  @ReactMethod
  fun clear(promise: Promise) {
    if (preferences.edit().clear().commit()) promise.resolve(null)
    else promise.reject("SESSION_CLEAR_FAILED", "Không xóa được phiên đăng nhập")
  }
}
