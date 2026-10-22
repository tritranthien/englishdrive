package com.englishdrive.audio

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class CommuteAudioPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(
      CommuteAudioModule(reactContext),
      LiveAudioModule(reactContext),
      SpeakerVerificationModule(reactContext),
      AuthSessionModule(reactContext),
      VocabularyStorageModule(reactContext),
      com.englishdrive.chat.ChatStorageModule(reactContext),
      com.englishdrive.chat.ChatNotificationsModule(reactContext),
    )

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> =
    listOf(
      com.englishdrive.video.VideoPlayerViewManager(reactContext),
    )
}
