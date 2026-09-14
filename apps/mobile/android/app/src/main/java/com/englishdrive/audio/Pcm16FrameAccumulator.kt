package com.englishdrive.audio

import java.util.ArrayDeque

internal class Pcm16FrameAccumulator {
  private val samples = ArrayDeque<Short>()
  private var pendingLowByte: Int? = null

  fun append(bytes: ByteArray) {
    var index = 0
    pendingLowByte?.let { low ->
      if (bytes.isNotEmpty()) {
        samples.addLast(((bytes[0].toInt() shl 8) or low).toShort())
        pendingLowByte = null
        index = 1
      }
    }
    while (index + 1 < bytes.size) {
      val low = bytes[index].toInt() and 0xff
      val high = bytes[index + 1].toInt()
      samples.addLast(((high shl 8) or low).toShort())
      index += 2
    }
    if (index < bytes.size) pendingLowByte = bytes[index].toInt() and 0xff
  }

  fun pop(frameLength: Int): ShortArray? {
    if (samples.size < frameLength) return null
    return ShortArray(frameLength) { samples.removeFirst() }
  }

  fun clear() {
    samples.clear()
    pendingLowByte = null
  }
}
