package com.englishdrive

import android.os.Bundle
import android.content.Intent
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory
import com.englishdrive.assistant.EnglishDriveVoiceInteractionService
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()
    super.onCreate(savedInstanceState)
    com.englishdrive.chat.ChatNotificationState.handleIntent(this, intent)
    if (intent.getBooleanExtra(
        EnglishDriveVoiceInteractionService.EXTRA_LAUNCHED_FROM_KEYGUARD,
        false,
      )
    ) {
      setShowWhenLocked(true)
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    com.englishdrive.chat.ChatNotificationState.handleIntent(this, intent)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "EnglishDrive"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
