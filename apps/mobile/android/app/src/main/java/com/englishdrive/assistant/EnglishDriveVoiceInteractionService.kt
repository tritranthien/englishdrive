package com.englishdrive.assistant

import android.content.Intent
import android.service.voice.VoiceInteractionService
import com.englishdrive.MainActivity
import com.englishdrive.audio.CommuteAudioService

class EnglishDriveVoiceInteractionService : VoiceInteractionService() {
  override fun onShutdown() {
    if (CommuteAudioService.wakeIsArmed) {
      stopService(Intent(this, CommuteAudioService::class.java))
    }
    super.onShutdown()
  }

  override fun onLaunchVoiceAssistFromKeyguard() {
    startActivity(
      Intent(this, MainActivity::class.java)
        .putExtra(EXTRA_LAUNCHED_FROM_KEYGUARD, true)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
    )
  }

  companion object {
    const val EXTRA_LAUNCHED_FROM_KEYGUARD = "englishDriveLaunchedFromKeyguard"
  }
}
