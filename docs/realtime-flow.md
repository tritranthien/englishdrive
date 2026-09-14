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
processing and local VAD. The bundled sherpa-onnx runtime computes a CAM++ speaker embedding from
the first 1.2 seconds, including 240 ms of pre-roll, and compares it with the locally enrolled profile using cosine
similarity. The gate holds that audio until it matches, then releases it to the existing barge-in
gate and Gemini. A rejected turn stays rejected until local VAD observes silence, preventing a
nearby speaker from opening the same turn for the enrolled user. Enrollment embeddings are stored
in app-private Android storage; raw enrollment audio is not persisted.

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

Gemini server VAD uses `START_OF_ACTIVITY_INTERRUPTS` with low start/end sensitivity, 160 ms of
speech confirmation, and 800 ms of silence tolerance. Only detected activity is included in a user
turn. These balanced defaults reduce traffic and wind false positives while preserving hands-free
turn taking.

Android attaches acoustic echo cancellation and noise suppression to the `VOICE_COMMUNICATION`
capture session when the device supports them. A local adaptive detector calibrates against the
ambient noise floor and requires four consecutive 40 ms chunks before reporting speech. While the
model speaks, `BargeInAudioGate` holds at most six chunks and sends them only after that confirmed
speech transition. The 240 ms pre-roll preserves the learner's first syllable. This gate is disabled
while the model is listening, and Gemini remains the authoritative turn detector.

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
