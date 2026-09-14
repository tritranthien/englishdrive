package com.englishdrive.audio

internal object MicrophoneLease {
  private var owner: String? = null

  @Synchronized
  fun acquire(nextOwner: String): Boolean {
    if (owner != null && owner != nextOwner) return false
    owner = nextOwner
    return true
  }

  @Synchronized
  fun release(currentOwner: String) {
    if (owner == currentOwner) owner = null
  }
}
