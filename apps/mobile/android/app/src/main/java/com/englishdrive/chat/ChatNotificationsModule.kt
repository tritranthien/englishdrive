package com.englishdrive.chat

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.englishdrive.BuildConfig
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import java.lang.ref.WeakReference
import java.util.UUID

object ChatNotificationState {
  private var react = WeakReference<ReactApplicationContext>(null)
  @Volatile var visibleThread: String? = null
  fun preferences(context: Context) = context.getSharedPreferences("chat_notifications", Context.MODE_PRIVATE)
  fun initialize(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel("friends", "Tin nhắn từ bạn bè", NotificationManager.IMPORTANCE_DEFAULT))
    if (BuildConfig.FIREBASE_APP_ID.isNotEmpty() && FirebaseApp.getApps(context).isEmpty()) {
      FirebaseApp.initializeApp(context, FirebaseOptions.Builder()
        .setApplicationId(BuildConfig.FIREBASE_APP_ID).setApiKey(BuildConfig.FIREBASE_API_KEY)
        .setProjectId(BuildConfig.FIREBASE_PROJECT_ID).setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID).build())
    }
  }
  fun attach(context: ReactApplicationContext) { react = WeakReference(context) }
  fun emit(name: String) {
    val context = react.get() ?: return
    if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, null)
  }
  fun handleIntent(context: Context, intent: Intent?) {
    val thread = intent?.getStringExtra("threadId") ?: return
    val user = intent.getStringExtra("userId") ?: return
    preferences(context).edit().putString("pendingThread",thread).putString("pendingUser",user).commit()
    intent.removeExtra("threadId"); intent.removeExtra("userId")
    emit("chatNotificationOpen")
  }
}

class ChatNotificationsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  init { ChatNotificationState.attach(context) }
  override fun getName() = "ChatNotifications"
  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit
  @ReactMethod fun setVisibleThread(threadId: String?) { ChatNotificationState.visibleThread = threadId }
  @ReactMethod fun consumeOpen(userId: String, promise: Promise) {
    val prefs = ChatNotificationState.preferences(context)
    val thread = if (prefs.getString("pendingUser", null) == userId) prefs.getString("pendingThread", null) else null
    prefs.edit().remove("pendingUser").remove("pendingThread").commit()
    promise.resolve(thread)
  }
  @ReactMethod fun configure(userId: String, promise: Promise) {
    try {
      ChatNotificationState.initialize(context)
      val prefs = ChatNotificationState.preferences(context)
      val installation = prefs.getString("installationId", null) ?: UUID.randomUUID().toString()
      check(prefs.edit().putString("activeUser", userId).putString("installationId", installation).commit())
      val manager = context.getSystemService(NotificationManager::class.java)
      val permission = NotificationManagerCompat.from(context).areNotificationsEnabled() &&
        manager.getNotificationChannel("friends")?.importance != NotificationManager.IMPORTANCE_NONE &&
        (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
      val result = Arguments.createMap().apply {
        putBoolean("configured", FirebaseApp.getApps(context).isNotEmpty())
        putBoolean("permissionGranted", permission)
        putString("installationId", installation)
      }
      if (FirebaseApp.getApps(context).isEmpty()) { promise.resolve(result); return }
      FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
        if (task.isSuccessful) { result.putString("token", task.result); promise.resolve(result) }
        else promise.reject("CHAT_PUSH_TOKEN", "Chưa đăng ký được thông báo tin nhắn", task.exception)
      }
    } catch (error: Exception) { promise.reject("CHAT_PUSH_SETUP", "Chưa cấu hình được thông báo", error) }
  }
  @ReactMethod fun clear(promise: Promise) {
    val prefs = ChatNotificationState.preferences(context)
    prefs.edit().remove("activeUser").remove("pendingUser").remove("pendingThread").commit()
    ChatNotificationState.visibleThread = null
    context.getSystemService(NotificationManager::class.java).cancelAll()
    if (FirebaseApp.getApps(context).isEmpty()) { promise.resolve(null); return }
    FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener { promise.resolve(null) }
  }
}
