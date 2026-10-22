package com.englishdrive.video

import android.annotation.SuppressLint
import android.graphics.Color
import android.content.pm.ActivityInfo
import android.view.View
import android.os.Build
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import org.json.JSONObject

class VideoPlayerContainer(
  context: ThemedReactContext,
  private val appContext: ReactApplicationContext,
) : FrameLayout(context) {
  var playerId: String = "default"
  private var sourceUrl: String = ""
  private var sourceType: String = "YOUTUBE"
  private var externalId: String = ""
  private var loadedSignature: String = ""
  private val webView: WebView = WebView(context)
  private var previousOrientation: Int? = null
  private var previousSystemUi: Int = 0

  @Suppress("DEPRECATION")
  fun setFullscreen(fullscreen: Boolean) {
    val activity = appContext.currentActivity ?: return
    if (fullscreen && previousOrientation == null) {
      previousOrientation = activity.requestedOrientation
      previousSystemUi = activity.window.decorView.systemUiVisibility
      activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
      activity.window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or
        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        activity.window.insetsController?.apply {
          hide(WindowInsets.Type.systemBars())
          systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
      }
    } else if (!fullscreen && previousOrientation != null) {
      activity.requestedOrientation = previousOrientation!!
      activity.window.decorView.systemUiVisibility = previousSystemUi
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        activity.window.insetsController?.show(WindowInsets.Type.systemBars())
      }
      previousOrientation = null
    }
  }

  fun release() {
    setFullscreen(false)
    webView.destroy()
  }

  init {
    setBackgroundColor(Color.BLACK)
    setupWebView()
    addView(
      webView,
      LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      ),
    )
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun setupWebView() {
    webView.setBackgroundColor(Color.BLACK)
    webView.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
      mediaPlaybackRequiresUserGesture = false
      loadsImagesAutomatically = true
      mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
      userAgentString =
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
    }
    webView.webChromeClient = WebChromeClient()
    webView.webViewClient = WebViewClient()
    webView.addJavascriptInterface(JsBridge(), "AndroidBridge")
  }

  inner class JsBridge {
    @JavascriptInterface
    fun onProgress(currentTimeMs: Double, durationMs: Double, isPlaying: Boolean) {
      if (!appContext.hasActiveReactInstance()) return
      val map = Arguments.createMap().apply {
        putString("playerId", playerId)
        putDouble("currentTimeMs", currentTimeMs)
        putDouble("durationMs", if (durationMs.isFinite()) durationMs else 0.0)
        putBoolean("isPlaying", isPlaying)
      }
      appContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("videoPlayerProgress", map)
    }
  }

  fun updateSource(
    newSourceUrl: String?,
    newSourceType: String?,
    newExternalId: String?,
  ) {
    if (newSourceUrl != null) sourceUrl = newSourceUrl
    if (newSourceType != null) sourceType = newSourceType
    if (newExternalId != null) externalId = newExternalId

    val signature = "$sourceType|$externalId|$sourceUrl"
    if (signature == loadedSignature || (sourceUrl.isBlank() && externalId.isBlank())) {
      return
    }
    loadedSignature = signature

    if (sourceType == "YOUTUBE" && externalId.isNotBlank()) {
      val safeVideoId = JSONObject.quote(externalId)
      val html = """
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <style>
            html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
            #player { width: 100%; height: 100%; border: 0; }
          </style>
        </head>
        <body>
          <div id="player"></div>
          <script src="https://www.youtube.com/iframe_api"></script>
          <script>
            var player = null;
            var timer = null;
            function emitProgress() {
              if (!player || typeof player.getCurrentTime !== 'function') return;
              var currentMs = (player.getCurrentTime() || 0) * 1000;
              var durationMs = (player.getDuration ? player.getDuration() : 0) * 1000;
              var state = player.getPlayerState ? player.getPlayerState() : -1;
              if (window.AndroidBridge && window.AndroidBridge.onProgress) {
                window.AndroidBridge.onProgress(currentMs, durationMs, state === 1);
              }
            }
            function onYouTubeIframeAPIReady() {
              player = new YT.Player('player', {
                videoId: $safeVideoId,
                playerVars: {
                  playsinline: 1,
                  fs: 0,
                  rel: 0,
                  modestbranding: 1,
                  cc_load_policy: 0,
                  iv_load_policy: 3,
                  origin: 'https://www.youtube-nocookie.com'
                },
                events: {
                  onReady: function() {
                    if (timer) clearInterval(timer);
                    emitProgress();
                    timer = setInterval(emitProgress, 100);
                  },
                  onStateChange: function() {
                    emitProgress();
                  }
                }
              });
            }
            window.__edSeekTo = function(seconds) {
              if (player && typeof player.seekTo === 'function') {
                player.seekTo(seconds, true);
                if (typeof player.playVideo === 'function') {
                  player.playVideo();
                }
                setTimeout(emitProgress, 80);
              }
            };
          </script>
        </body>
        </html>
      """.trimIndent()
      webView.loadDataWithBaseURL(
        "https://www.youtube-nocookie.com",
        html,
        "text/html",
        "utf-8",
        null,
      )
    } else if (sourceUrl.isNotBlank()) {
      val safeUrl = JSONObject.quote(sourceUrl)
      val html = """
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <style>
            html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; }
            video { width: 100%; height: 100%; object-fit: contain; background: #000; }
            video::-webkit-media-controls-fullscreen-button { display: none; }
          </style>
        </head>
        <body>
          <video id="v" controls controlsList="nofullscreen" playsinline preload="metadata"></video>
          <script>
            var v = document.getElementById('v');
            v.src = $safeUrl;
            function emit() {
              if (window.AndroidBridge && window.AndroidBridge.onProgress) {
                window.AndroidBridge.onProgress((v.currentTime || 0) * 1000, (v.duration || 0) * 1000, !v.paused);
              }
            }
            v.addEventListener('timeupdate', emit);
            v.addEventListener('play', emit);
            v.addEventListener('pause', emit);
            v.addEventListener('seeked', emit);
            v.addEventListener('waiting', emit);
            v.addEventListener('playing', emit);
            v.addEventListener('ratechange', emit);
            setInterval(function() { if (!v.paused) emit(); }, 100);
            window.__edSeekTo = function(seconds) {
              v.currentTime = seconds;
              var p = v.play();
              if (p && typeof p.catch === 'function') p.catch(function(){});
              emit();
            };
          </script>
        </body>
        </html>
      """.trimIndent()
      webView.loadDataWithBaseURL(
        sourceUrl,
        html,
        "text/html",
        "utf-8",
        null,
      )
    }
  }

  fun seekTo(seekRequest: String?) {
    if (seekRequest.isNullOrBlank()) return
    val timePart = seekRequest.substringBefore(':')
    val timeMs = timePart.toDoubleOrNull() ?: return
    val seconds = (timeMs / 1000.0).coerceAtLeast(0.0)
    webView.post {
      webView.evaluateJavascript(
        "if (window.__edSeekTo) { window.__edSeekTo($seconds); }",
        null,
      )
    }
  }

  override fun onDetachedFromWindow() {
    webView.onPause()
    super.onDetachedFromWindow()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    webView.onResume()
  }
}

class VideoPlayerViewManager(
  private val appContext: ReactApplicationContext,
) : SimpleViewManager<VideoPlayerContainer>() {
  override fun getName(): String = "EnglishDriveVideoPlayer"

  override fun createViewInstance(reactContext: ThemedReactContext): VideoPlayerContainer =
    VideoPlayerContainer(reactContext, appContext)

  override fun onDropViewInstance(view: VideoPlayerContainer) {
    view.release()
    super.onDropViewInstance(view)
  }

  @ReactProp(name = "fullscreen", defaultBoolean = false)
  fun setFullscreen(view: VideoPlayerContainer, fullscreen: Boolean) {
    view.setFullscreen(fullscreen)
  }

  @ReactProp(name = "playerId")
  fun setPlayerId(view: VideoPlayerContainer, playerId: String?) {
    view.playerId = playerId ?: "default"
  }

  @ReactProp(name = "sourceUrl")
  fun setSourceUrl(view: VideoPlayerContainer, sourceUrl: String?) {
    view.updateSource(sourceUrl ?: "", null, null)
  }

  @ReactProp(name = "sourceType")
  fun setSourceType(view: VideoPlayerContainer, sourceType: String?) {
    view.updateSource(null, sourceType ?: "YOUTUBE", null)
  }

  @ReactProp(name = "externalId")
  fun setExternalId(view: VideoPlayerContainer, externalId: String?) {
    view.updateSource(null, null, externalId ?: "")
  }

  @ReactProp(name = "seekRequest")
  fun setSeekRequest(view: VideoPlayerContainer, seekRequest: String?) {
    view.seekTo(seekRequest)
  }
}
