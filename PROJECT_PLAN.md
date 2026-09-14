# English Drive — Updated Implementation Plan

## Product goal

Build an Android-first, hands-free English tutor for long commute sessions. The experience should
feel like a low-latency call: the learner speaks naturally, hears a spoken response, interrupts at
any time, and does not need to look at the screen while travelling.

## Current architecture

- React Native and TypeScript own the Android UI and logical conversation lifecycle.
- Kotlin owns microphone capture, streaming playback, foreground-service lifetime, audio focus,
  assistant integration, and on-device wake detection.
- NestJS owns authentication, user/session metadata, provider token provisioning, persistence, and
  future learning analysis.
- PostgreSQL and Prisma store application state. Raw microphone and model audio are not persisted.
- Mobile connects directly to the realtime provider. NestJS never proxies realtime audio.
- Permanent provider keys remain server-side; mobile receives short-lived credentials.

## Provider strategy

Gemini Live is the default MVP provider. Provider protocol is isolated behind the small
`LiveConversationProvider` boundary. The existing OpenAI Realtime implementation remains in the
repository as optional code, but is not the default mobile path. Do not build a large provider
factory until Gemini Live is stable.

## Completed milestones

1. **M0 — Bootstrap:** pnpm monorepo, React Native Android app, NestJS, Prisma, PostgreSQL, lint,
   formatting, tests, and documentation.
2. **M1 — Backend foundation:** users, learning profiles, authentication, and logical conversation
   sessions.
3. **M2/M3 — Foreground realtime POC and server authorization:** direct realtime transport,
   short-lived client credentials, audio state, and barge-in proof of concept.
4. **M4 — Android background conversation:** microphone/media foreground service, screen-lock
   lifecycle, audio focus, Bluetooth-compatible communication routing, and reconnect boundary.
5. **M5 — Android assistant and wake phrase:** default assistant role, manually armed foreground
   microphone service, and Android on-device “Hey English Drive” detection. No boot auto-arm.

## Completed realtime milestone

### M6 — Gemini Live realtime voice

Gemini is the default realtime path. The backend provisions short-lived, single-use ephemeral tokens for an
authenticated, active logical session. Android captures PCM16 mono audio at 16 kHz and streams it
directly to Gemini over WebSocket. Gemini PCM16 mono output at 24 kHz is streamed to Android audio
playback. Server VAD handles turns and interruption; an interrupted response immediately clears the
local playback queue.

Transport reconnects must reuse the logical backend session. A new short-lived token may be
requested while the last resumable Gemini handle preserves provider context. The permanent Gemini
API key must never enter the mobile bundle.

Token provisioning, direct WebSocket audio, model playback, server VAD, interruption, playback
clearing, and internal connection state have been verified end to end on an Android device.

## Completed reliability milestone

### M7 — Commute-grade reliability

The foreground service monitors validated network availability and Android communication-device
changes. Temporary network loss pauses capture, clears playback, and keeps the logical backend
session active. Reconnection waits for a usable network, obtains a fresh ephemeral token, and uses
the latest Gemini resumption handle. Retry delay is capped so a longer tunnel or coverage gap does
not permanently end the commute session.

Gemini context-window compression keeps a long audio-only session bounded. Android selects an
available Bluetooth or wired communication device and recreates capture/playback after route
changes so old audio buffers cannot overlap on the new route.

## Completed tutor milestone

### M8 — English tutor engine

The backend builds a compact tutor policy from the learner's level, language mode, correction
preference, conversation style, and selected conversation mode. The backend returns the policy with
the ephemeral session configuration; it is not hard-coded in the mobile application.

The Android UI offers Free conversation, Daily life, Work/software, Vocabulary, Grammar, Role play,
and Pronunciation modes before starting a hands-free session. Reconnects retain the selected mode.
The policy keeps responses short, asks one follow-up question at a time, supports English/Vietnamese
voice requests, and avoids visual exercises during a commute.

## Completed persistence milestone

### M9 — Session transcript and persistence

Gemini input and output transcriptions are consolidated into finalized conversation turns before
they are saved. The mobile app uploads timestamped transcript batches outside the realtime audio
path. Client message IDs make retries idempotent, and any final pending batch is committed in the
same request that completes the logical session.

Session details return transcript turns in chronological order. Provider and model metadata are
recorded when a Gemini token is provisioned, and duration is calculated when the session ends. Raw
microphone and model audio remain memory-only and are never written to PostgreSQL.

## Completed analysis milestone

### M10 — Post-session analysis

Completing a session schedules a persisted background analysis without delaying realtime audio.
Gemini Flash-Lite receives the ordered transcript and must return schema-constrained JSON. The API
validates the response again with Zod before storing a Vietnamese summary, main topics, evidenced
grammar corrections, new vocabulary, strengths, recommended topics, and the next-session focus.

Analysis jobs expose pending, processing, completed, and failed states. Pending work resumes after
an API restart, failed work can be retried, and transcript changes invalidate an older report. The
Android app polls after ending a session and renders an After Trip Report.

## Completed learning-memory milestone

### M11 — Learning memory

Every completed, validated session analysis is atomically projected into normalized mistake and
vocabulary memory. Session link tables make the projection idempotent: retrying or replacing an
analysis updates the same session contribution instead of inflating occurrence counts. Existing
M10 reports are backfilled once and marked with `memoryUpdatedAt`.

Before Gemini Live token provisioning, the backend builds a bounded snapshot with at most three
recurring patterns, five review words, two learning goals, four recent topics, and two short
session summaries. Tutor instructions ask Gemini to use this context subtly, select at most two
goals, and avoid announcing tests or forcing every remembered item into the conversation. Full
historical transcripts are never injected.

## Remaining milestones

12. **M12 — Usage and cost:** duration, connection/reconnect counts, audio seconds, tokens, errors,
    and estimated cost.
13. **M13 — Multi-provider product support:** provider configuration and factory only after Gemini
    is stable.
14. **M14 — Production hardening:** rate limiting, quotas, monitoring, crash reporting, retention,
    privacy, cleanup, and retry policy.

## Architecture rules

1. Preserve completed M0–M5 code unless compatibility requires a focused refactor.
2. Hands-free behavior and realtime latency take priority over UI complexity.
3. Do not proxy raw realtime audio through NestJS.
4. Permanent API keys stay on the backend.
5. A logical learning session is separate from a WebSocket connection.
6. Do not store raw audio by default.
7. Keep realtime transport separate from post-session analysis and learning memory.
8. Keep injected learning context compact and bounded.
9. Do not begin a later milestone automatically.

## Current implementation boundary

M0–M11 are complete. Do not begin M12 automatically.
