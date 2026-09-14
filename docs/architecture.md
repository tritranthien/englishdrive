# Architecture

The Android client connects directly to Gemini Live over WebSocket using a short-lived ephemeral
token. A native Kotlin foreground service owns the microphone-service lifetime, partial wake lock,
communication audio mode, and audio focus. Separate native audio components capture PCM16 mono at
16 kHz and stream PCM16 mono model output at 24 kHz. React Native owns Gemini protocol and logical
session recovery. The NestJS API owns identity, token provisioning, session authorization,
persistence, analysis orchestration, and compact learning context.
PostgreSQL stores learning data and transcripts; raw audio is not stored by default.

Realtime transport and the learning engine are separate subsystems. This boundary keeps mobile
audio lifecycle failures from corrupting learning state and allows either side to evolve without
rewriting the other.

The existing OpenAI WebRTC implementation remains optional and is not used by the default screen.
The foreground service can only be armed by an explicit action while the app is visible. It is not
sticky and has no boot receiver. Screen locking does not create a second session, and reconnects
reuse the existing backend session ID.

For commute reliability, the foreground service observes validated network connectivity and audio
device changes. React Native owns reconnect policy while Android owns communication-device
selection and route notifications. Gemini context-window compression bounds long-session history;
session-resumption handles bridge periodic WebSocket replacement without creating a new learning
session.

Finalized transcript turns cross the HTTP boundary independently of realtime audio. PostgreSQL
stores each turn with a session-scoped client message ID, role, content, and occurrence time so a
mobile retry cannot duplicate it. Session detail queries include ordered transcript data, while
token authorization uses a lightweight session lookup that does not load conversation history.

Post-session analysis uses a persisted job record rather than the Gemini Live connection. Session
completion returns after scheduling; a Gemini text model analyzes the transcript in the backend and
its schema-validated report is stored for the Android After Trip Report. Raw audio is never used by
this worker.

The same transaction that completes a valid analysis refreshes its learning-memory projection.
Normalized mistake and vocabulary rows hold cross-session state, while join tables preserve the
source session and make reanalysis idempotent. Token provisioning queries only bounded memory and
the two latest reports, then appends that snapshot to the backend-managed tutor instruction. It
does not load or send historical transcripts.
