package com.englishdrive.audio

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WakePhraseMatcherTest {
  @Test
  fun acceptsExpectedWakePhraseVariants() {
    assertTrue(WakePhraseMatcher.matches(listOf("Hey, English Drive!")))
    assertTrue(WakePhraseMatcher.matches(listOf("okay", "hey EnglishDrive please")))
  }

  @Test
  fun rejectsUnrelatedSpeech() {
    assertFalse(WakePhraseMatcher.matches(listOf("English driving practice")))
    assertFalse(WakePhraseMatcher.matches(emptyList()))
  }
}
