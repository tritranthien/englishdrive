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
  private val primeScore: (ByteArray) -> Unit = {},
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
      if (threshold > 0f) preRoll.forEach(primeScore)
      preRoll.clear()
    }

    if (!candidate) return TargetSpeakerGateResult()
    if (speaking) speechBytes += chunk.size
    pending.addLast(chunk.copyOf())
    while (pending.size > maxPendingChunks) pending.removeFirst()

    var justAccepted = false
    var acceptanceReason: String? = null
    var scoreUpdated = false
    // Zero explicitly disables identity verification. A short first reply may
    // never produce an embedding, so comparing scores alone cannot implement it.
    if (!accepted && threshold == 0f) {
      justAccepted = true
      acceptanceReason = "threshold-disabled"
      accepted = true
    }
    if (!accepted) {
      // Onset pre-roll is energy-qualified by the verifier, like later frames.
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
        // A short embedding is useful for the first match, but a low short
        // score is not strong enough to invalidate a recent longer match.
        val replyBytes = collectedSpeechBytes?.invoke() ?: speechBytes
        val finalScore = finishScore()
        if (finalScore != null) {
          latestScore = finalScore
          scoreUpdated = true
          bestScore = maxOf(bestScore ?: finalScore, finalScore)
          // Runtime readiness does not mean a short embedding is reliable.
          // Production supplies energy-qualified bytes; callers without a
          // duration source retain the original score-only contract.
          val reliable = collectedSpeechBytes == null || replyBytes >= MIN_VERIFICATION_BYTES
          if (finalScore >= threshold && reliable) {
            justAccepted = true
            acceptanceReason = "end-of-turn-match"
          } else if (finalScore < threshold && replyBytes >= MIN_VERIFICATION_BYTES) {
            lastAcceptedAt = Long.MIN_VALUE
          }
        }
        // Use the verifier's energy-qualified speech, excluding VAD's silence tail.
        if (!justAccepted && continuityActive() &&
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
