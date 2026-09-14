package com.englishdrive.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.englishdrive.MainActivity
import com.englishdrive.R

class CommuteAudioService : Service(), AudioManager.OnAudioFocusChangeListener, RecognitionListener {
  private lateinit var audioManager: AudioManager
  private lateinit var connectivityManager: ConnectivityManager
  private var audioFocusRequest: AudioFocusRequest? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var speechRecognizer: SpeechRecognizer? = null
  private var wakeArmed = false
  private val handler = Handler(Looper.getMainLooper())
  private val audioDeviceCallback =
    object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) = refreshAudioRoute()

      override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) = refreshAudioRoute()
    }
  private val networkCallback =
    object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) = refreshNetworkState()

      override fun onLost(network: Network) = refreshNetworkState()

      override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) =
        refreshNetworkState()
    }

  override fun onCreate() {
    super.onCreate()
    audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    audioManager.registerAudioDeviceCallback(audioDeviceCallback, handler)
    connectivityManager.registerDefaultNetworkCallback(networkCallback, handler)
    refreshNetworkState()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }

    val armWake = intent?.action == ACTION_ARM_WAKE
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      buildNotification(armWake),
      if (armWake) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      } else {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      },
    )
    acquireWakeLock()
    if (armWake) {
      abandonAudioFocus()
      audioManager.mode = AudioManager.MODE_NORMAL
      startWakeRecognition()
    } else {
      stopWakeRecognition()
      configureCallAudio()
      requestAudioFocus()
    }
    running = true
    return START_NOT_STICKY
  }

  override fun onAudioFocusChange(focusChange: Int) {
    val hasFocus = focusChange == AudioManager.AUDIOFOCUS_GAIN
    sendBroadcast(
      Intent(ACTION_AUDIO_FOCUS_CHANGED)
        .setPackage(packageName)
        .putExtra(EXTRA_HAS_FOCUS, hasFocus),
    )
  }

  override fun onDestroy() {
    running = false
    stopWakeRecognition()
    abandonAudioFocus()
    audioManager.unregisterAudioDeviceCallback(audioDeviceCallback)
    connectivityManager.unregisterNetworkCallback(networkCallback)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) audioManager.clearCommunicationDevice()
    audioManager.mode = AudioManager.MODE_NORMAL
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
    sendBroadcast(Intent(ACTION_SERVICE_STOPPED).setPackage(packageName))
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onReadyForSpeech(params: Bundle?) = Unit

  override fun onBeginningOfSpeech() = Unit

  override fun onRmsChanged(rmsdB: Float) = Unit

  override fun onBufferReceived(buffer: ByteArray?) = Unit

  override fun onEndOfSpeech() = Unit

  override fun onError(error: Int) {
    if (!wakeArmed) return
    if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
      sendWakeError("Microphone permission is required for wake detection")
      stopWakeRecognition()
      return
    }
    scheduleWakeRestart()
  }

  override fun onResults(results: Bundle?) {
    if (!detectWakePhrase(results)) scheduleWakeRestart()
  }

  override fun onPartialResults(partialResults: Bundle?) {
    detectWakePhrase(partialResults)
  }

  override fun onEvent(eventType: Int, params: Bundle?) = Unit

  private fun configureCallAudio() {
    audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
    selectPreferredCommunicationDevice()
    refreshAudioRoute()
  }

  private fun selectPreferredCommunicationDevice() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val preferred =
      audioManager.availableCommunicationDevices.firstOrNull {
        it.type == AudioDeviceInfo.TYPE_BLE_HEADSET
      } ?: audioManager.availableCommunicationDevices.firstOrNull {
        it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
      } ?: audioManager.availableCommunicationDevices.firstOrNull {
        it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
          it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
          it.type == AudioDeviceInfo.TYPE_USB_HEADSET
      } ?: audioManager.availableCommunicationDevices.firstOrNull {
        it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
      }
    val current = audioManager.communicationDevice
    if (preferred == null && current != null) audioManager.clearCommunicationDevice()
    else if (preferred != null && current?.id != preferred.id) audioManager.setCommunicationDevice(preferred)
  }

  private fun refreshAudioRoute() {
    if (audioManager.mode == AudioManager.MODE_IN_COMMUNICATION) selectPreferredCommunicationDevice()
    val device =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        audioManager.communicationDevice
      } else {
        null
      }
    currentRouteType = routeType(device)
    currentRouteName = device?.productName?.toString() ?: currentRouteType
    sendBroadcast(Intent(ACTION_AUDIO_ROUTE_CHANGED).setPackage(packageName))
  }

  private fun refreshNetworkState() {
    val capabilities = connectivityManager.getNetworkCapabilities(connectivityManager.activeNetwork)
    val available =
      capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true &&
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    if (available == networkIsAvailable) return
    networkIsAvailable = available
    sendBroadcast(
      Intent(ACTION_NETWORK_CHANGED)
        .setPackage(packageName)
        .putExtra(EXTRA_NETWORK_AVAILABLE, available),
    )
  }

  private fun requestAudioFocus() {
    val attributes =
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    audioFocusRequest =
      AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(attributes)
        .setAcceptsDelayedFocusGain(true)
        .setOnAudioFocusChangeListener(this)
        .build()
    val result = audioManager.requestAudioFocus(audioFocusRequest!!)
    onAudioFocusChange(
      if (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        AudioManager.AUDIOFOCUS_GAIN
      } else {
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
      },
    )
  }

  private fun abandonAudioFocus() {
    audioFocusRequest?.let(audioManager::abandonAudioFocusRequest)
    audioFocusRequest = null
  }

  private fun startWakeRecognition() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      !SpeechRecognizer.isOnDeviceRecognitionAvailable(this)
    ) {
      sendWakeError("On-device speech recognition is unavailable")
      stopSelf()
      return
    }
    stopWakeRecognition()
    wakeArmed = true
    wakeIsArmed = true
    speechRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this).apply {
      setRecognitionListener(this@CommuteAudioService)
    }
    listenForWakePhrase()
    sendBroadcast(Intent(ACTION_WAKE_STATE_CHANGED).setPackage(packageName).putExtra(EXTRA_WAKE_ARMED, true))
  }

  private fun listenForWakePhrase() {
    if (!wakeArmed) return
    val recognizerIntent =
      Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
      }
    speechRecognizer?.startListening(recognizerIntent)
  }

  private fun scheduleWakeRestart() {
    handler.removeCallbacksAndMessages(null)
    handler.postDelayed({ listenForWakePhrase() }, WAKE_RESTART_DELAY_MS)
  }

  private fun detectWakePhrase(results: Bundle?): Boolean {
    val candidates = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
    val detected = WakePhraseMatcher.matches(candidates)
    if (!detected) return false

    wakeArmed = false
    wakeIsArmed = false
    handler.removeCallbacksAndMessages(null)
    speechRecognizer?.cancel()
    speechRecognizer?.destroy()
    speechRecognizer = null
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      buildNotification(false),
      ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
    )
    sendBroadcast(Intent(ACTION_WAKE_DETECTED).setPackage(packageName))
    sendBroadcast(Intent(ACTION_WAKE_STATE_CHANGED).setPackage(packageName).putExtra(EXTRA_WAKE_ARMED, false))
    return true
  }

  private fun stopWakeRecognition() {
    val wasArmed = wakeArmed
    wakeArmed = false
    wakeIsArmed = false
    handler.removeCallbacksAndMessages(null)
    speechRecognizer?.cancel()
    speechRecognizer?.destroy()
    speechRecognizer = null
    if (wasArmed) {
      sendBroadcast(Intent(ACTION_WAKE_STATE_CHANGED).setPackage(packageName).putExtra(EXTRA_WAKE_ARMED, false))
    }
  }

  private fun sendWakeError(message: String) {
    sendBroadcast(
      Intent(ACTION_WAKE_ERROR).setPackage(packageName).putExtra(EXTRA_WAKE_ERROR, message),
    )
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock =
      powerManager
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:commute-audio")
        .apply { acquire() }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel =
      NotificationChannel(
        CHANNEL_ID,
        getString(R.string.commute_notification_channel),
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = getString(R.string.commute_notification_channel_description)
        setSound(null, null)
      }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun buildNotification(wakeMode: Boolean): Notification {
    val openAppIntent = Intent(this, MainActivity::class.java)
    val openApp =
      PendingIntent.getActivity(
        this,
        0,
        openAppIntent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    val stopIntent = Intent(this, CommuteAudioService::class.java).setAction(ACTION_STOP)
    val stopAction =
      PendingIntent.getService(
        this,
        1,
        stopIntent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(
        getString(if (wakeMode) R.string.wake_notification_title else R.string.commute_notification_title),
      )
      .setContentText(
        getString(if (wakeMode) R.string.wake_notification_text else R.string.commute_notification_text),
      )
      .setContentIntent(openApp)
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .addAction(0, getString(R.string.commute_notification_stop), stopAction)
      .build()
  }

  companion object {
    const val ACTION_AUDIO_FOCUS_CHANGED = "com.englishdrive.AUDIO_FOCUS_CHANGED"
    const val ACTION_SERVICE_STOPPED = "com.englishdrive.COMMUTE_AUDIO_STOPPED"
    const val ACTION_NETWORK_CHANGED = "com.englishdrive.NETWORK_CHANGED"
    const val ACTION_AUDIO_ROUTE_CHANGED = "com.englishdrive.AUDIO_ROUTE_CHANGED"
    const val ACTION_ARM_WAKE = "com.englishdrive.ARM_WAKE"
    const val ACTION_WAKE_DETECTED = "com.englishdrive.WAKE_DETECTED"
    const val ACTION_WAKE_STATE_CHANGED = "com.englishdrive.WAKE_STATE_CHANGED"
    const val ACTION_WAKE_ERROR = "com.englishdrive.WAKE_ERROR"
    const val EXTRA_HAS_FOCUS = "hasFocus"
    const val EXTRA_NETWORK_AVAILABLE = "networkAvailable"
    const val EXTRA_WAKE_ARMED = "wakeArmed"
    const val EXTRA_WAKE_ERROR = "wakeError"
    const val ACTION_STOP = "com.englishdrive.STOP_COMMUTE_AUDIO"
    private const val CHANNEL_ID = "commute_audio"
    private const val NOTIFICATION_ID = 2401
    private const val WAKE_RESTART_DELAY_MS = 500L

    @Volatile var running = false
    @Volatile var wakeIsArmed = false
    @Volatile var networkIsAvailable = true
    @Volatile private var currentRouteType = "other"
    @Volatile private var currentRouteName = "Audio device"

    fun currentRouteMap() =
      com.facebook.react.bridge.Arguments.createMap().apply {
        putString("type", currentRouteType)
        putString("name", currentRouteName)
      }

    private fun routeType(device: AudioDeviceInfo?): String =
      when (device?.type) {
        AudioDeviceInfo.TYPE_BLE_HEADSET,
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth"
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_USB_HEADSET -> "wired"
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
        AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
        else -> "other"
      }
  }
}
