package com.englishdrive.audio

import java.util.ArrayDeque

internal data class TargetSpeakerGateResult(
  val chunks: List<ByteArray> = emptyList(),
  val activity: Boolean? = null,
  val started: Boolean = false,
  val confidence: Float? = null,
  val reason: String? = null,
)

/** Holds the complete turn while several speaker windows are evaluated. */
internal class TargetSpeakerAudioGate(
  private val score: (ByteArray) -> Float?,
  private val threshold: Float = 0.36f,
  private val preRollChunks: Int = 10,
  private val maxPendingChunks: Int = 2_250,
  private val finishScore: () -> Float? = { null },
  private val clockMillis: () -> Long = System::currentTimeMillis,
) {
  private val preRoll = ArrayDeque<ByteArray>()
  private val pending = ArrayDeque<ByteArray>()
  private var candidate = false
  private var accepted = false
  private var adequateHits = 0
  private var bestScore: Float? = null
  private var lastAcceptedAt = Long.MIN_VALUE

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
      pending.clear()
      pending.addAll(preRoll)
      preRoll.clear()
    }

    if (!candidate) return TargetSpeakerGateResult()
    pending.addLast(chunk.copyOf())
    while (pending.size > maxPendingChunks) pending.removeFirst()

    var justAccepted = false
    var acceptanceReason: String? = null
    if (!accepted) {
      // Keep pre-roll for Gemini but exclude its mostly silent frames from the
      // speaker embedding so short utterances are not diluted.
      val nextScore = score(chunk)
      if (nextScore != null) {
        bestScore = maxOf(bestScore ?: nextScore, nextScore)
        val effectiveThreshold = effectiveThreshold()
        adequateHits = if (nextScore >= effectiveThreshold) adequateHits + 1 else 0
        if (adequateHits >= REQUIRED_ADEQUATE_HITS) {
          justAccepted = true
          acceptanceReason = "verified-consensus"
        }
      }

      if (!justAccepted && activityChange == false) {
        val finalScore = finishScore()
        if (finalScore != null) {
          bestScore = maxOf(bestScore ?: finalScore, finalScore)
          val endThreshold = effectiveThreshold()
          if (finalScore >= endThreshold) {
            justAccepted = true
            acceptanceReason = "end-of-turn-match"
          }
        }
      }

      if (justAccepted) {
        accepted = true
        lastAcceptedAt = clockMillis()
      }
    }

    val output =
      if (accepted) pending.toList().also { pending.clear() }
      else emptyList()
    val activity = if (justAccepted) true else null

    if (activityChange == false) {
      val endActivity = if (accepted) false else null
      val result =
        TargetSpeakerGateResult(
          chunks = output,
          activity = endActivity ?: activity,
          started = justAccepted,
          confidence = bestScore,
          reason = acceptanceReason ?: if (accepted) "accepted" else "no-match",
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
    )
  }

  fun reset() {
    preRoll.clear()
    lastAcceptedAt = Long.MIN_VALUE
    resetTurn()
  }

  private fun effectiveThreshold(): Float {
    val continuityActive =
      lastAcceptedAt != Long.MIN_VALUE && clockMillis() - lastAcceptedAt <= CONTINUITY_WINDOW_MS
    return if (continuityActive) (threshold - CONTINUITY_MARGIN).coerceAtLeast(MIN_THRESHOLD)
    else threshold
  }

  private fun resetTurn() {
    pending.clear()
    candidate = false
    accepted = false
    adequateHits = 0
    bestScore = null
  }

  private fun addBounded(queue: ArrayDeque<ByteArray>, chunk: ByteArray, limit: Int) {
    queue.addLast(chunk.copyOf())
    while (queue.size > limit) queue.removeFirst()
  }

  private companion object {
    const val REQUIRED_ADEQUATE_HITS = 2
    const val CONTINUITY_MARGIN = 0.02f
    const val CONTINUITY_WINDOW_MS = 6_000L
    const val MIN_THRESHOLD = 0.14f
  }
}
