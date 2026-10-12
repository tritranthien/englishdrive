# Gemini Live realtime flow

English Drive keeps the logical learning session in NestJS while Android connects directly to
Gemini Live. NestJS never receives microphone or model audio.

```text
Android                    NestJS                         Gemini Live
   | POST /sessions           |                                |
   |------------------------->| create logical session         |
   |<-------------------------| session ID                     |
   | POST /live/token         |                                |
   |------------------------->| authorize user/session         |
   |                          | create short-lived token       |
   |<-------------------------| short-lived token + model      |
   | WebSocket setup ----------------------------------------->|
   |<------------------------------------------- setupComplete |
   | PCM16 16 kHz chunks ------------------------------------>|
   |<-------------------------------------- PCM16 24 kHz audio |
   |<-------------------------------- transcript / interruption|
   | POST /sessions/:id/transcript |                                |
   |------------------------------>| persist finalized turns        |
   | POST /sessions/:id/complete   |                                |
   |------------------------------>| final turns + duration          |
```

The permanent `GEMINI_API_KEY` exists only in the API environment. The token endpoint requires a
JWT and an active session owned by that user. The token is single-use for new sessions and expires;
the backend-built mobile configuration supplies the model, tutor instruction, transcription, VAD,
and session-resumption settings.

## Android audio boundary

When an enrolled speaker profile exists, Android applies a target-speaker gate after echo/noise
processing and local VAD. If no profile exists, Android streams directly to Gemini Live. The
bundled sherpa-onnx runtime computes streaming CAM++ embeddings after 2 seconds of real speech,
then every 200 ms using the most recent 2 seconds. At turn end it also scores shorter replies
with at least 400 ms of energy-qualified real speech for diagnostics only: a sample under
2 seconds cannot establish identity even if its score is high. The UI displays `sampleSpeechMs`
and labels short scores as provisional instead of comparable to a full-length enrollment sample.
Voiced onset from 400 ms of VAD pre-roll
feeds the verifier so delayed speech detection does not truncate the speaker sample. Pre-roll
silence is excluded by the same high-pass/energy check used for later frames.
It uses the profile's calibrated cosine threshold
(phone 0.22–0.30, headset 0.10–0.16). No short audio is repeated to manufacture model input.
The gate buffers audio until two consecutive scores match, or a completed turn's embedding
matches with at least 2 seconds of real speech.
After a verified turn, replies with 200 ms to under 2 seconds of energy-qualified speech may inherit identity at
the end of the reply for 30 seconds. Inherited replies never extend that deadline.
A scored mismatch with at least 2 seconds of real speech clears identity. Low short-turn scores
do not revoke recent identity because those embeddings vary strongly with duration;
restarting capture (including microphone route changes) clears it too. Echo suppression
discards buffered audio but preserves the original identity deadline through AI playback. The trade-off
is that another person's short reply can pass during this window; this is a conversation filter.
Enrollment and verification both high-pass the embedding input. Older capture-pipeline profiles require
re-enrollment. Embeddings stay in app-private storage; raw enrollment audio is not persisted.

For a standalone trial APK with speaker/VAD diagnostics and bundled JavaScript, build
`:app:assembleRelease -PvoiceFilterDiagnostics=true`. Its version name is `1.1-voice-trial` and logs tagged
`EnglishDriveAudio` distinguish `short-reply-continuity`, matches, `no-match`, and filter bypass without
recording raw speech. Omit the property for normal builds.

The My Voice Filter panel receives `liveSpeakerMatch` events with the profile kind, latest cosine
score (nullable), applied threshold (nullable), decision and reason. It distinguishes insufficient
speech, verified matches, rejected turns, inherited short replies, bypass and a disabled filter.
Inherited/bypassed/off states never display a stale match score. Updates are emitted on score
computation and turn/state transitions rather than every captured audio frame.

Each mic profile has a persisted optional manual threshold, adjustable from 0.00 to 1.00 in steps
of 0.01. Manual thresholds bypass the automatic calibration caps.
A manual threshold of **0.00 disables speaker identity verification**: the first
VAD speech frame releases the buffered pre-roll immediately, even for a short first reply with
no embedding. Local speech detection and playback echo protection remain active. The match panel
reports `off` with reason `threshold-disabled` and no similarity score. Positive thresholds retain
the real-speech minimum and matching/continuity rules above. Resetting to automatic removes
the override; re-enrollment preserves it, while deleting the profile removes it. Changes during
capture are applied at the next VAD turn start, clearing inherited identity and bypass. The UI
shows the saved setting separately from the actual threshold until it takes effect. Settings and
embeddings stay on the device; these events do not transmit audio or voiceprints to the server.

`LiveAudioModule` captures raw, little-endian PCM16 mono at 16 kHz in 40 ms chunks. It emits base64
chunks to React Native because Gemini's raw WebSocket protocol carries audio inside JSON. Model
audio is decoded natively and streamed through an `AudioTrack` at 24 kHz. No raw audio is written to
disk.

The Kotlin audio layer, `GeminiLiveProvider`, and `useLiveConversation` have separate jobs:

- Kotlin captures input and plays output.
- `GeminiLiveProvider` implements Gemini messages, setup, transcripts, interruption, and resumption
  handles.
- `useLiveConversation` owns the logical session, permissions, foreground-service lifecycle,
  state, and retry schedule.

Input transcription commits one authoritative user turn. Incremental output transcription is
combined until Gemini reports generation completion or interruption, producing one assistant
turn. Mobile uploads these finalized turns in small idempotent batches; audio never enters the
backend. A final pending batch is saved atomically with session completion.

Gemini may deliver JSON messages as WebSocket binary frames on React Native Android. React Native
0.87 exposes those frames as `ArrayBuffer` by default, so the provider decodes their UTF-8 bytes
and preserves arrival order before parsing protocol messages. Blob frames are supported as well.

## Interruption

Gemini server VAD uses `START_OF_ACTIVITY_INTERRUPTS` with balanced sensitivity, 300 ms of
prefix padding, and 800 ms of silence tolerance. Only detected activity is included in a user
turn. These defaults provide natural turn taking while preserving the learner's first syllable.

Android attaches acoustic echo cancellation and noise suppression to the `VOICE_COMMUNICATION`
capture session when the device supports them. A local adaptive detector calibrates against the
ambient noise floor and requires two consecutive 40 ms chunks (80 ms) before reporting speech, with
an 800 ms silence hold. While the model speaks, `BargeInAudioGate` holds at most six chunks and
sends them only after that confirmed speech transition. The 240 ms pre-roll preserves the learner's
first syllable. This gate is disabled while the model is listening, and Gemini remains the
authoritative turn detector.

When `serverContent.interrupted` arrives, the provider immediately tells `LiveAudioModule` to
invalidate queued writes, pause, flush, and restart its playback buffer.

## Reconnect

Transport loss does not complete the backend session. The native foreground service reports
validated network changes. The mobile hook stops microphone capture, clears playback, and waits
when the device is offline. Once a network is available, retries use capped exponential backoff;
each attempt requests a fresh ephemeral token and supplies the newest Gemini session-resumption
handle. The same backend session ID remains active throughout.

Gemini setup enables sliding-window context compression for long audio sessions. `goAway` closes
only the current transport so the hook can reconnect before the logical session ends. Android also
reports communication route changes; capture and playback are recreated when Bluetooth, wired, or
phone routing changes, which prevents old buffered audio from playing on the new device.
