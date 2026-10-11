package com.englishdrive.audio

import java.util.ArrayDeque

internal data class TargetSpeakerGateResult(
  val chunks: List<ByteArray> = emptyList(),
  val activity: Boolean? = null,
  val started: Boolean = false,
  val confidence: Float? = null,
  val reason: String? = null,
  val latestScore: Float? = null,
  val scoreUpdated: Boolean = false,
)

/** Buffers unverified turns; nearby short replies inherit a verified identity. */
internal class TargetSpeakerAudioGate(
  private val score: (ByteArray) -> Float?,
  private var threshold: Float = 0.36f,
  private val preRollChunks: Int = 10,
  private val maxPendingChunks: Int = 2_250,
  private val finishScore: () -> Float? = { null },
  private val clockMillis: () -> Long = System::currentTimeMillis,
  private val collectedSpeechBytes: (() -> Int)? = null,
) {
  private val preRoll = ArrayDeque<ByteArray>()
  private val pending = ArrayDeque<ByteArray>()
  private var candidate = false
  private var accepted = false
  private var adequateHits = 0
  private var bestScore: Float? = null
  private var lastAcceptedAt = Long.MIN_VALUE
  private var speechBytes = 0
  private var latestScore: Float? = null
  val currentThreshold: Float get() = threshold

  fun updateThreshold(value: Float) {
    require(value.isFinite() && value in 0f..1f)
    threshold = value
    reset()
  }

  fun process(chunk: ByteArray, speaking: Boolean, activityChange: Boolean?): TargetSpeakerGateResult {
    if (!candidate && !speaking && activityChange != true) {
      addBounded(preRoll, chunk, preRollChunks)
      return TargetSpeakerGateResult()
    }

    if (activityChange == true) {
      candidate = true
      accepted = false
      adequateHits = 0
      bestScore = null
      speechBytes = 0
      latestScore = null
      pending.clear()
      pending.addAll(preRoll)
      preRoll.clear()
    }

    if (!candidate) return TargetSpeakerGateResult()
    if (speaking) speechBytes += chunk.size
    pending.addLast(chunk.copyOf())
    while (pending.size > maxPendingChunks) pending.removeFirst()

    var justAccepted = false
    var acceptanceReason: String? = null
    var scoreUpdated = false
    if (!accepted) {
      // Keep pre-roll for Gemini but exclude its mostly silent frames from the
      // speaker embedding so short utterances are not diluted.
      val nextScore = score(chunk)
      if (nextScore != null) {
        latestScore = nextScore
        scoreUpdated = true
        bestScore = maxOf(bestScore ?: nextScore, nextScore)
        if (nextScore < threshold) lastAcceptedAt = Long.MIN_VALUE
        adequateHits = if (nextScore >= threshold) adequateHits + 1 else 0
        if (adequateHits >= REQUIRED_ADEQUATE_HITS) {
          justAccepted = true
          acceptanceReason = "verified-consensus"
        }
      }

      if (!justAccepted && activityChange == false) {
        val finalScore = finishScore()
        if (finalScore != null) {
          latestScore = finalScore
          scoreUpdated = true
          bestScore = maxOf(bestScore ?: finalScore, finalScore)
          if (finalScore >= threshold) {
            justAccepted = true
            acceptanceReason = "end-of-turn-match"
          } else {
            lastAcceptedAt = Long.MIN_VALUE
          }
        }
        // Use the verifier's energy-qualified speech, excluding VAD's silence tail.
        val replyBytes = collectedSpeechBytes?.invoke() ?: speechBytes
        if (!justAccepted && bestScore == null && continuityActive() &&
          replyBytes >= MIN_SHORT_REPLY_BYTES && replyBytes < MIN_VERIFICATION_BYTES
        ) {
          justAccepted = true
          acceptanceReason = "short-reply-continuity"
        }
      }

      if (justAccepted) {
        accepted = true
        // Inherited replies never renew identity. Only a real embedding match does.
        if (acceptanceReason != "short-reply-continuity") lastAcceptedAt = clockMillis()
      }
    }

    val output =
      if (accepted) pending.toList().also { pending.clear() }
      else emptyList()
    val activity = if (justAccepted) true else null

    if (activityChange == false) {
      if (accepted && acceptanceReason != "short-reply-continuity") {
        lastAcceptedAt = clockMillis()
      }
      val endActivity = if (accepted) false else null
      val result =
        TargetSpeakerGateResult(
          chunks = output,
          activity = endActivity ?: activity,
          started = justAccepted,
          confidence = bestScore,
          reason = acceptanceReason ?: if (accepted) "accepted" else "no-match",
          latestScore = latestScore,
          scoreUpdated = scoreUpdated,
        )
      resetTurn()
      addBounded(preRoll, chunk, preRollChunks)
      return result
    }

    return TargetSpeakerGateResult(
      chunks = output,
      activity = activity,
      started = justAccepted,
      confidence = bestScore,
      reason = acceptanceReason,
      latestScore = latestScore,
      scoreUpdated = scoreUpdated,
    )
  }

  fun reset(clearIdentity: Boolean = true) {
    preRoll.clear()
    if (clearIdentity) lastAcceptedAt = Long.MIN_VALUE
    resetTurn()
  }

  private fun continuityActive(): Boolean =
    lastAcceptedAt != Long.MIN_VALUE &&
      clockMillis() - lastAcceptedAt in 0..CONTINUITY_WINDOW_MS

  private fun resetTurn() {
    pending.clear()
    candidate = false
    accepted = false
    adequateHits = 0
    bestScore = null
    speechBytes = 0
    latestScore = null
  }

  private fun addBounded(queue: ArrayDeque<ByteArray>, chunk: ByteArray, limit: Int) {
    queue.addLast(chunk.copyOf())
    while (queue.size > limit) queue.removeFirst()
  }

  private companion object {
    const val REQUIRED_ADEQUATE_HITS = 2
    const val CONTINUITY_WINDOW_MS = 30_000L
    const val MIN_SHORT_REPLY_BYTES = 16_000 * 2 / 5 // 200 ms of VAD speech
    const val MIN_VERIFICATION_BYTES = 16_000 * 2 * 2 // two seconds
  }
}
