package com.englishdrive.audio

import java.util.Locale

internal object WakePhraseMatcher {
  fun matches(candidates: List<String>): Boolean =
    candidates.any { phrase ->
      val normalized =
        phrase.lowercase(Locale.US).replace(Regex("[^a-z]+"), " ").trim()
      normalized.contains("hey english drive") || normalized.contains("hey englishdrive")
    }
}
