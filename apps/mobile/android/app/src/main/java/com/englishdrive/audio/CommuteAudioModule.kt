package com.englishdrive.audio

import android.Manifest
import android.app.Activity
import android.app.role.RoleManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class CommuteAudioModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  private var listenerCount = 0
  private var receiverRegistered = false
  private var roleRequestPromise: Promise? = null

  private val activityListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
      ) {
        if (requestCode != REQUEST_ASSISTANT_ROLE) return
        roleRequestPromise?.resolve(resultCode == Activity.RESULT_OK)
        roleRequestPromise = null
      }
    }

  private val focusReceiver =
    object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        when (intent?.action) {
          CommuteAudioService.ACTION_AUDIO_FOCUS_CHANGED ->
            emit(
              EVENT_AUDIO_FOCUS_CHANGED,
              intent.getBooleanExtra(CommuteAudioService.EXTRA_HAS_FOCUS, false),
            )
          CommuteAudioService.ACTION_SERVICE_STOPPED -> emit(EVENT_SERVICE_STOPPED, null)
          CommuteAudioService.ACTION_NETWORK_CHANGED ->
            emit(
              EVENT_NETWORK_CHANGED,
              intent.getBooleanExtra(CommuteAudioService.EXTRA_NETWORK_AVAILABLE, false),
            )
          CommuteAudioService.ACTION_AUDIO_ROUTE_CHANGED ->
            emit(EVENT_AUDIO_ROUTE_CHANGED, CommuteAudioService.currentRouteMap())
          CommuteAudioService.ACTION_WAKE_DETECTED -> emit(EVENT_WAKE_DETECTED, null)
          CommuteAudioService.ACTION_WAKE_STATE_CHANGED ->
            emit(
              EVENT_WAKE_STATE_CHANGED,
              intent.getBooleanExtra(CommuteAudioService.EXTRA_WAKE_ARMED, false),
            )
          CommuteAudioService.ACTION_WAKE_ERROR ->
            emit(
              EVENT_WAKE_ERROR,
              intent.getStringExtra(CommuteAudioService.EXTRA_WAKE_ERROR)
                ?: "Wake detection failed",
            )
        }
      }
    }

  init {
    reactContext.addActivityEventListener(activityListener)
  }

  private fun emit(eventName: String, value: Any?) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, value)
  }

  override fun getName() = "CommuteAudio"

  @ReactMethod
  fun start(promise: Promise) {
    try {
      val intent = Intent(reactContext, CommuteAudioService::class.java)
      ContextCompat.startForegroundService(reactContext, intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("COMMUTE_AUDIO_START_FAILED", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    reactContext.stopService(Intent(reactContext, CommuteAudioService::class.java))
    promise.resolve(null)
  }

  @ReactMethod
  fun isRunning(promise: Promise) {
    promise.resolve(CommuteAudioService.running)
  }

  @ReactMethod
  fun getRuntimeStatus(promise: Promise) {
    promise.resolve(
      com.facebook.react.bridge.Arguments.createMap().apply {
        putBoolean("networkAvailable", CommuteAudioService.networkIsAvailable)
        putMap("audioRoute", CommuteAudioService.currentRouteMap())
      },
    )
  }

  @ReactMethod
  fun getAssistantStatus(promise: Promise) {
    val roleManager = reactContext.getSystemService(RoleManager::class.java)
    val status =
      com.facebook.react.bridge.Arguments.createMap().apply {
        putBoolean(
          "roleAvailable",
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            roleManager.isRoleAvailable(RoleManager.ROLE_ASSISTANT),
        )
        putBoolean("isDefaultAssistant", roleManager.isRoleHeld(RoleManager.ROLE_ASSISTANT))
        putBoolean(
          "onDeviceWakeAvailable",
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            android.speech.SpeechRecognizer.isOnDeviceRecognitionAvailable(reactContext),
        )
        putBoolean("wakeArmed", CommuteAudioService.wakeIsArmed)
      }
    promise.resolve(status)
  }

  @ReactMethod
  fun requestAssistantRole(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      promise.reject("ANDROID_VERSION_UNSUPPORTED", "Wake assistant requires Android 12 or newer")
      return
    }
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Open the app before selecting the default assistant")
      return
    }
    val roleManager = reactContext.getSystemService(RoleManager::class.java)
    if (!roleManager.isRoleAvailable(RoleManager.ROLE_ASSISTANT)) {
      promise.reject("ASSISTANT_ROLE_UNAVAILABLE", "The assistant role is unavailable")
      return
    }
    if (roleManager.isRoleHeld(RoleManager.ROLE_ASSISTANT)) {
      promise.resolve(true)
      return
    }
    if (roleRequestPromise != null) {
      promise.reject("ROLE_REQUEST_ACTIVE", "An assistant role request is already open")
      return
    }
    roleRequestPromise = promise
    activity.startActivityForResult(
      roleManager.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT),
      REQUEST_ASSISTANT_ROLE,
    )
  }

  @ReactMethod
  fun armWakeWord(promise: Promise) {
    val roleManager = reactContext.getSystemService(RoleManager::class.java)
    if (!roleManager.isRoleHeld(RoleManager.ROLE_ASSISTANT)) {
      promise.reject("NOT_DEFAULT_ASSISTANT", "Set EnglishDrive as the default assistant first")
      return
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      !android.speech.SpeechRecognizer.isOnDeviceRecognitionAvailable(reactContext)
    ) {
      promise.reject("ON_DEVICE_RECOGNIZER_UNAVAILABLE", "On-device wake detection is unavailable")
      return
    }
    if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject("MICROPHONE_PERMISSION_REQUIRED", "Microphone permission is required")
      return
    }
    ContextCompat.startForegroundService(
      reactContext,
      Intent(reactContext, CommuteAudioService::class.java).setAction(CommuteAudioService.ACTION_ARM_WAKE),
    )
    promise.resolve(null)
  }

  @ReactMethod
  fun disarmWakeWord(promise: Promise) {
    if (CommuteAudioService.wakeIsArmed) {
      reactContext.stopService(Intent(reactContext, CommuteAudioService::class.java))
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun addListener(eventName: String) {
    listenerCount += 1
    if (receiverRegistered || eventName !in SUPPORTED_EVENTS) return
    val filter =
      IntentFilter(CommuteAudioService.ACTION_AUDIO_FOCUS_CHANGED).apply {
        addAction(CommuteAudioService.ACTION_SERVICE_STOPPED)
        addAction(CommuteAudioService.ACTION_NETWORK_CHANGED)
        addAction(CommuteAudioService.ACTION_AUDIO_ROUTE_CHANGED)
        addAction(CommuteAudioService.ACTION_WAKE_DETECTED)
        addAction(CommuteAudioService.ACTION_WAKE_STATE_CHANGED)
        addAction(CommuteAudioService.ACTION_WAKE_ERROR)
      }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(focusReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION") reactContext.registerReceiver(focusReceiver, filter)
    }
    receiverRegistered = true
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    listenerCount = (listenerCount - count).coerceAtLeast(0)
    if (listenerCount == 0 && receiverRegistered) {
      reactContext.unregisterReceiver(focusReceiver)
      receiverRegistered = false
    }
  }

  override fun invalidate() {
    if (receiverRegistered) reactContext.unregisterReceiver(focusReceiver)
    receiverRegistered = false
    super.invalidate()
  }

  companion object {
    private const val REQUEST_ASSISTANT_ROLE = 4512
    const val EVENT_AUDIO_FOCUS_CHANGED = "commuteAudioFocusChanged"
    const val EVENT_SERVICE_STOPPED = "commuteAudioStopped"
    const val EVENT_NETWORK_CHANGED = "commuteNetworkChanged"
    const val EVENT_AUDIO_ROUTE_CHANGED = "commuteAudioRouteChanged"
    const val EVENT_WAKE_DETECTED = "englishDriveWakeDetected"
    const val EVENT_WAKE_STATE_CHANGED = "englishDriveWakeStateChanged"
    const val EVENT_WAKE_ERROR = "englishDriveWakeError"
    val SUPPORTED_EVENTS =
      setOf(
        EVENT_AUDIO_FOCUS_CHANGED,
        EVENT_SERVICE_STOPPED,
        EVENT_NETWORK_CHANGED,
        EVENT_AUDIO_ROUTE_CHANGED,
        EVENT_WAKE_DETECTED,
        EVENT_WAKE_STATE_CHANGED,
        EVENT_WAKE_ERROR,
      )
  }
}
