package com.englishdrive.audio

import java.util.ArrayDeque

internal data class TargetSpeakerGateResult(
  val chunks: List<ByteArray> = emptyList(),
  val activity: Boolean? = null,
  val started: Boolean = false,
)

/**
 * Holds a short turn until the enrolled speaker is verified. A rejected turn is
 * locked out until silence so another speaker cannot become accepted midway.
 */
internal class TargetSpeakerAudioGate(
  private val score: (ByteArray) -> Float?,
  private val threshold: Float = 0.38f,
  private val requiredHits: Int = 1,
  private val preRollChunks: Int = 6,
  private val maxPendingChunks: Int = 40,
  private val finishScore: () -> Float? = { null },
) {
  private val preRoll = ArrayDeque<ByteArray>()
  private val pending = ArrayDeque<ByteArray>()
  private var candidate = false
  private var accepted = false
  private var lockedOut = false
  private var hits = 0

  fun process(
    chunk: ByteArray,
    speaking: Boolean,
    activityChange: Boolean?,
  ): TargetSpeakerGateResult {
    if (!candidate && !speaking && activityChange != true) {
      addBounded(preRoll, chunk, preRollChunks)
      return TargetSpeakerGateResult()
    }

    if (activityChange == true) {
      candidate = true
      accepted = false
      lockedOut = false
      hits = 0
      pending.clear()
      pending.addAll(preRoll)
      preRoll.clear()
    }

    if (!candidate) return TargetSpeakerGateResult()
    // AudioRecord reuses its read buffer. Own every buffered frame so later
    // reads cannot overwrite the beginning of the verified utterance.
    pending.addLast(chunk.copyOf())

    var justAccepted = false
    if (!accepted && !lockedOut) {
      // Feed the pre-roll into the embedding window as well. This preserves the
      // beginning of the utterance and shortens the perceived verification delay.
      val scoreInput =
        if (activityChange == true && pending.size > 1) {
          ByteArray(pending.sumOf { it.size }).also { combined ->
            var offset = 0
            pending.forEach { bytes ->
              bytes.copyInto(combined, destinationOffset = offset)
              offset += bytes.size
            }
          }
        } else {
          chunk
        }
      val nextScore = score(scoreInput) ?: if (activityChange == false) finishScore() else null
      hits = if (nextScore != null && nextScore >= threshold) hits + 1 else 0
      if (hits >= requiredHits) {
        accepted = true
        justAccepted = true
      }
      if (!accepted && pending.size >= maxPendingChunks) lockedOut = true
    }

    val output =
      if (accepted) {
        pending.toList().also { pending.clear() }
      } else {
        while (pending.size > maxPendingChunks) pending.removeFirst()
        emptyList()
      }
    val activity = if (justAccepted) true else null

    if (activityChange == false) {
      val endActivity = if (accepted) false else null
      resetTurn()
      addBounded(preRoll, chunk, preRollChunks)
      return TargetSpeakerGateResult(output, endActivity ?: activity, justAccepted)
    }

    return TargetSpeakerGateResult(output, activity, justAccepted)
  }

  fun reset() {
    preRoll.clear()
    resetTurn()
  }

  private fun resetTurn() {
    pending.clear()
    candidate = false
    accepted = false
    lockedOut = false
    hits = 0
  }

  private fun addBounded(queue: ArrayDeque<ByteArray>, chunk: ByteArray, limit: Int) {
    queue.addLast(chunk.copyOf())
    while (queue.size > limit) queue.removeFirst()
  }
}
