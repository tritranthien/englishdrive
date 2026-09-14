package com.englishdrive.audio

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Test

class Pcm16FrameAccumulatorTest {
  @Test
  fun `assembles little endian pcm across chunks`() {
    val accumulator = Pcm16FrameAccumulator()
    accumulator.append(byteArrayOf(0x34, 0x12, 0xFE.toByte()))
    assertNull(accumulator.pop(2))

    accumulator.append(byteArrayOf(0xFF.toByte(), 0x78, 0x56))

    assertArrayEquals(shortArrayOf(0x1234, -2), accumulator.pop(2))
    assertArrayEquals(shortArrayOf(0x5678), accumulator.pop(1))
    assertNull(accumulator.pop(1))
  }
}
