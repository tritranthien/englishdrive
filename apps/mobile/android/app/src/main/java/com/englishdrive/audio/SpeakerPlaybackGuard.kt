package com.englishdrive.audio

/** Half-duplex phone playback: includes queued PCM, AudioTrack drain and room echo tail. */
internal class SpeakerPlaybackGuard(private val clockMillis: () -> Long) {
  private var pendingBuffers = 0
  private var writtenFrames = 0L
  private var lastPlayingAt = Long.MIN_VALUE

  @Synchronized fun queued() { pendingBuffers += 1 }
  @Synchronized fun written(bytes: Int) { writtenFrames += bytes / 2 }
  @Synchronized fun completed() { pendingBuffers = (pendingBuffers - 1).coerceAtLeast(0) }

  @Synchronized
  fun suppressCapture(renderedFrames: Long): Boolean {
    val now = clockMillis()
    if (pendingBuffers > 0 || writtenFrames > renderedFrames) {
      lastPlayingAt = now
      return true
    }
    return lastPlayingAt != Long.MIN_VALUE && now - lastPlayingAt < ECHO_TAIL_MS
  }

  @Synchronized
  fun reset() {
    pendingBuffers = 0
    writtenFrames = 0
    lastPlayingAt = Long.MIN_VALUE
  }

  companion object { const val ECHO_TAIL_MS = 500L }
}
