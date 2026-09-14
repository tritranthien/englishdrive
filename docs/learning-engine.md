# Learning Engine

The learning engine builds a compact snapshot before each session from the learner profile, top
recurring mistakes, vocabulary due for review, and recent analysis results. It selects one or two
subtle goals and sends only that snapshot to the Realtime tutor.

Post-session analysis runs as persisted background work after session completion. Gemini receives
the ordered transcript using a separate text model and schema-constrained output; Zod validates the
JSON again before the report is stored. Pending jobs resume after an API restart and failed jobs can
be retried. The report contains a Vietnamese summary, main topics, evidenced grammar corrections,
new vocabulary, strengths, recommendations, and the next-session focus.

M11 projects each validated analysis into normalized `Mistake` and `VocabularyItem` records. The
`SessionMistake` and `SessionVocabulary` links record which sessions contributed each item, so
reanalysis replaces a session's contribution instead of double counting it. Existing completed
reports are imported once through the `memoryUpdatedAt` checkpoint.

`LearningContextService` limits each snapshot to three recurring patterns, five review words, two
current goals, four recent topics, and two summaries of at most 300 characters each. The tutor is
asked to reintroduce useful material naturally and never receives full transcript history.
Advanced spaced repetition remains outside the MVP.
