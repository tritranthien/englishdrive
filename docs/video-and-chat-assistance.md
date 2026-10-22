# Video subtitles and chat assistance

## Chat

Type `i want to play ` followed by a backtick, `bóng đá`, and another
backtick. After a 300 ms pause, the composer replaces the marked phrase with
`football`. Only text inside complete, nonempty single-backtick pairs is
translated. Several pairs can be pasted or typed into one draft. Incomplete,
escaped and Markdown code-fence markers are left alone.

The draft stays editable while translation runs. Responses for an older draft
are discarded, the cursor is mapped to the replacement text, and the updated
draft is saved locally. Send stays disabled while marked phrases remain. On a
network/provider failure use **Thử dịch lại**, or remove the markers to send the
original text. Translation never creates or sends a chat message.

Tap a word in a delivered user/character message to open its options.
**Dịch từ** displays the contextual Vietnamese meaning directly in the popup.
**Giải thích từ** covers its meaning and reusable expressions, with **Lưu từ**
and **Chi tiết** for editable meaning and example. **Cả câu** explains the whole
message without selecting it, with useful expressions that can be saved separately.
**Chọn cụm** lets the user tap the last
word of a phrase, including reverse selections, up to 120 characters. Copy uses
the Android clipboard. Character messages also offer whole-message translation
and explanation. Long press and screen-reader activation open the same menu.

`POST /chat/threads/:id/draft-translation` accepts `{draft}` (1–4000 UTF-16
code units, with whitespace preserved) and returns
`{replacements:[{start,end,text}]}`. Ranges include both backticks and use UTF-16
indices like the existing vocabulary endpoint. Ownership is checked before
cache access. Translation uses the existing Gemini provider and HELP quota
(60 new assistance jobs per user/hour), cached by thread and exact draft hash.
No database migration is needed.

## Subtitles

The video stays above a scrollable settings/transcript area. **Phóng lớn** expands
the same player to landscape fullscreen, hides navigation and retains the bilingual
overlay and playback position. **Thu nhỏ** or Android Back restores the inline view.
**Tùy chỉnh phụ đề**
opens sliders for font size, actual box width, background opacity and overall
opacity, plus positioning presets and reset. The corner has a 44 dp touch area;
dragging the corner and dragging the box are separate gestures. The displayed
box is clamped inside the video. Settings are persisted per account, with
serialized writes and a 250 ms debounce.

YouTube processing now gets timed captions from yt-dlp, preferring human tracks
over automatic captions and English within each group. Without usable captions,
it downloads audio, converts it to mono 16 kHz WAV and runs faster-whisper with
word timestamps and VAD. Silence stays in the original timeline. Sentences are
grouped on punctuation, pauses of at least 700 ms, or six seconds at a source
word boundary. Untimed manual-caption fragments retain their original range.

Gemini translates batches of 30 source segment IDs. IDs are verified and timing
comes exclusively from the source transcript. The source English/Vietnamese
text is retained when applicable. Valid millisecond values are never guessed to
be MM:SS. Display uses `[startMs,endMs)` and 100 ms player progress events.
**Tạo lại phụ đề** regenerates old results; no automatic bulk regeneration runs.
Completed videos can be regenerated from the beginning. Both YouTube and direct
videos use the transcription service in sequential 15-minute ranges. A 60-minute
video has four chunks. Only each requested range is downloaded for ASR, and local
word times are offset back into the original video timeline. Translations are saved
after every batch so subtitles are usable while status is still `PROCESSING`.
`processedUntilMs` is a persisted checkpoint advanced only after the whole chunk is
translated. Failed jobs keep completed subtitles; retry/restart resumes from that
checkpoint and replaces partial results from an unfinished chunk. Silence is valid
inside a chunk. The client shows completed/total chunks and processed time.

## Running the transcription service

```powershell
docker compose up -d --build transcription
pnpm api:dev
```

The local API defaults to `TRANSCRIPTION_URL=http://localhost:8000`.
`POST /youtube/transcript` accepts a validated 11-character `videoId`.
`POST /video/transcript` also accepts `sourceUrl` for public direct media; private
addresses and non-HTTP URLs are rejected. Supply `startSeconds` and `chunkSeconds`
(up to 900) to process one range. Responses include
`{source,languageCode,title,durationMs,startMs,endMs,segments:[{id,startMs,endMs,text}]}`.
Production does not expose the service's port. `/health` is independent of job execution. Audio work runs in a child
process, with one job at a time; a second request gets HTTP 429. The API serializes
video jobs and reloads persisted `PROCESSING` jobs after restart. Timed-out or
disconnected requests terminate the process group and clean up temporary files.

Defaults, configurable in `deploy/.env.example`:

| Setting                              | Default                |
| ------------------------------------ | ---------------------- |
| `WHISPER_MODEL`                      | `small` (multilingual) |
| `WHISPER_CPU_THREADS`                | `2`, CPU int8          |
| `TRANSCRIPTION_MAX_DURATION_SECONDS` | `3600`                 |
| `TRANSCRIPTION_MAX_AUDIO_BYTES`      | `104857600`            |
| `TRANSCRIPTION_TIMEOUT_SECONDS`      | `1800`                 |

Limits produce explicit errors while preserving completed chunks. Public YouTube
videos can still be unavailable from the server because of source restrictions;
these failures are reported rather than replaced by estimated timestamps.

The model downloads on the first ASR job and is retained in `whisper_models`.
PyAV is pinned to `16.0.1`: faster-whisper 1.2.1 uses a decoding argument removed
in PyAV 19. The container build includes a real PCM WAV decoding regression test.
Budget RAM for the model plus API/PostgreSQL and the 512 MiB temporary filesystem;
measure peak usage and processing time on the target VPS before enabling user
traffic. Readiness confirms service availability, not that a model has downloaded.

## Deployment and verification

The deployment driver builds and tags both API and transcription images with
`DEPLOY_SHA`; Compose starts both and checks health. Rollback uses the previous
release's full Compose configuration. On the first upgrade from an older release
that had no transcription service, an unused new transcription container can
remain after rollback; it has no public port.

Existing VPS installations must update `/usr/local/sbin/englishdrive-deploy`
from the reviewed `deploy/deploy.sh` (or rerun `deploy/bootstrap.sh`) before
deploying this release. The timer does not update its own driver. Apply the new
environment values, deploy backend, then distribute the updated Android build.

```powershell
pnpm --filter @english-drive/shared build
pnpm --filter @english-drive/shared test
pnpm --filter @english-drive/api test --maxWorkers=1
pnpm --filter @english-drive/api build
pnpm --filter @english-drive/mobile test -- src/features/chat src/features/video __tests__/navigation.test.tsx
pnpm typecheck
python -m unittest discover -s services/transcription -p 'test_*.py'
```

On an Android device, check the sliders, corner/box gestures, draft replacement
with a Vietnamese keyboard, double taps, phrase selection and saved vocabulary.
For timing acceptance, compare at least 20 manually marked speech starts across
the beginning, middle and end of a captioned video and a video using ASR. Target
90% within 500 ms of speech and rendering within 200 ms of the source timestamp;
unit tests alone do not establish these timing measurements.

## VPS deployment verified on 2026-10-19

The workspace snapshot was deployed manually as
`video-chat-audio-20261019T154844Z`; `/opt/englishdrive/current` points to that
release. Database backups were verified before switching containers; no pending
migrations were present. The previous API and audio images remain available for
rollback. The Git deployment SHA marker was preserved and the existing timer
was restored; this manual release does not publish the uncommitted workspace to
Git. Update the installed deployment driver before a future Git-based release,
as described above.

Production checks passed for authenticated backtick translation, vocabulary
lookup, cached translations, and a public 19-second YouTube video producing five
bilingual cues in `READY` state with start times identical to the source caption
track. Temporary accounts, messages and video records were removed afterwards.
API and transcription health checks passed, including API access from outside
the VPS.

A real CPU int8 `small` inference test on synthetic English speech completed in
12 seconds with approximately 804 MiB peak process RSS. Model files are cached
in the persistent volume. This is a short-audio smoke test, not a benchmark for
the full 60-minute limit.

The deployment exposed two runtime issues that are fixed in source: PyAV 19
decoder incompatibility, and a slow text-model fallback after a provider 503.
Text translation now tries `gemini-2.5-flash` before the preview fallback and
limits each text request to 30 seconds; multimodal requests keep their existing
90-second limit.
