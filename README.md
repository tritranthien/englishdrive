# English Drive

Android-first realtime English tutor. The default MVP voice path uses **Gemini Live**: Android
captures and plays streaming PCM audio while the mobile app connects directly to Gemini using a
server-issued ephemeral token. Background conversation, interruption, reconnect, and manually armed
on-device “Hey English Drive” detection reuse the native lifecycle built in earlier milestones.

## Repository layout

```text
apps/
  api/       NestJS API with Prisma and environment validation
  mobile/    Android-only React Native application
packages/
  shared/        Shared TypeScript contracts
  eslint-config/ Shared TypeScript ESLint rules
docs/            Architecture notes for future milestones
```

## Prerequisites

- Node.js 22.11 or newer
- pnpm 10.15.1 (`corepack enable` or `npm install --global pnpm@10.15.1`)
- Docker with Docker Compose
- For Android: Android Studio, JDK 17+, Android SDK 37, and an emulator or physical device

The generated React Native version requires Android build tools 37, compiles with SDK 37, targets
SDK 36, and supports Android 10/API 29 and newer.

## Local setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
```

On PowerShell, replace the copy command with:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Start the API and Metro together:

```bash
pnpm dev
```

In another terminal, start the Android application:

```bash
pnpm android
```

The on-device **My Voice Filter** uses the bundled open-source sherpa-onnx runtime and CAM++ speaker
embedding model. It requires no account, API key, or per-use payment. Sign in, tap **ENROLL MY
VOICE**, and keep speaking naturally in a quiet place until enrollment reaches 100%. The resulting
embedding stays in app-private storage on that Android device. Raw enrollment audio is never saved.

The API listens on `http://localhost:3000`. `GET /health` verifies both the API and PostgreSQL
connection.

Milestone 1 API routes:

| Method  | Route                          | Authentication | Purpose                   |
| ------- | ------------------------------ | -------------- | ------------------------- |
| `POST`  | `/auth/register`               | Public         | Create user and profile   |
| `POST`  | `/auth/login`                  | Public         | Get a JWT access token    |
| `GET`   | `/users/me`                    | Bearer token   | Read current user         |
| `GET`   | `/learning/profile`            | Bearer token   | Read learning profile     |
| `PATCH` | `/learning/profile`            | Bearer token   | Update learning settings  |
| `GET`   | `/learning/context`            | Bearer token   | Read bounded tutor memory |
| `POST`  | `/sessions`                    | Bearer token   | Start a session           |
| `GET`   | `/sessions`                    | Bearer token   | List session history      |
| `GET`   | `/sessions/:id`                | Bearer token   | Read session + transcript |
| `POST`  | `/sessions/:id/transcript`     | Bearer token   | Append transcript turns   |
| `POST`  | `/sessions/:id/complete`       | Bearer token   | Save pending turns + end  |
| `GET`   | `/sessions/:id/analysis`       | Bearer token   | Read analysis report      |
| `POST`  | `/sessions/:id/analysis/retry` | Bearer token   | Retry failed analysis     |
| `POST`  | `/realtime/session`            | Bearer token   | Get short-lived access    |
| `POST`  | `/live/token`                  | Bearer token   | Get Gemini Live token     |

## Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Run database-backed e2e tests after PostgreSQL is healthy:

```bash
pnpm --filter @english-drive/api test:e2e
```

## Configuration

`apps/api/.env` is validated when the API starts:

| Variable                | Default                         | Purpose                                |
| ----------------------- | ------------------------------- | -------------------------------------- |
| `NODE_ENV`              | `development`                   | Runtime environment                    |
| `PORT`                  | `3000`                          | API port                               |
| `DATABASE_URL`          | required                        | PostgreSQL connection URL              |
| `JWT_SECRET`            | required                        | JWT signing secret, at least 32 chars  |
| `JWT_EXPIRES_IN`        | `1d`                            | Access-token lifetime accepted by JOSE |
| `LIVE_PROVIDER`         | `gemini`                        | Default realtime provider              |
| `GEMINI_API_KEY`        | required for Gemini             | Permanent server-side Gemini key       |
| `GEMINI_LIVE_MODEL`     | `gemini-3.1-flash-live-preview` | Gemini Live model ID                   |
| `GEMINI_ANALYSIS_MODEL` | `gemini-3.1-flash-lite`         | Post-session analysis model            |
| `OPENAI_API_KEY`        | optional                        | Future OpenAI provider key             |
| `OPENAI_REALTIME_MODEL` | `gpt-realtime-2.1`              | Realtime model ID                      |
| `OPENAI_REALTIME_VOICE` | `alloy`                         | Realtime output voice                  |

Never add permanent Gemini or OpenAI credentials to the mobile application. NestJS provisions a
short-lived, single-use Gemini token for an authenticated active session. During USB development,
forward both local services before opening the app:

```powershell
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000
```

For wireless debugging on Android 11 or newer, enable **Developer options → Wireless debugging**,
pair once, connect using the separate debug port shown by Android, and restore the same reverse
ports:

```powershell
adb pair PHONE_IP:PAIRING_PORT
adb connect PHONE_IP:DEBUG_PORT
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000
```

The phone and development computer must remain reachable on the same local network. The app keeps
running if ADB disconnects, but Metro reload and live ADB logs stop until the connection returns.

## Learning memory

Completed analysis results update normalized mistake and vocabulary records. Per-session links
keep this process idempotent when an analysis is retried. Before each Gemini Live connection, the
API adds a compact learning snapshot to the tutor instructions: up to three recurring patterns,
five review words, two current goals, four recent topics, and two short summaries. The realtime
request never includes full transcript history.

## Android background conversation

Start the Realtime session while the app is visible. Once it reaches `Listening`, the screen may be
locked. Android displays an ongoing `EnglishDrive conversation active` notification while the
microphone foreground service is running.

The native service holds a partial wake lock and uses communication audio mode. Android audio APIs
retain control of the selected wired, speaker, or Bluetooth route. Audio focus loss, including a
phone call, temporarily stops microphone capture; focus gain restores it. A failed Gemini
WebSocket retries after 1, 2, and 4 seconds using the existing backend conversation ID.

The service starts only from the visible app after the user taps `START GEMINI LIVE`. It uses
`START_NOT_STICKY`, so Android does not silently restart microphone capture after the service or app
is stopped.

## Android assistant and wake phrase

Wake detection requires Android 12/API 31 or newer and an installed on-device speech recognizer.
The app never falls back to network recognition. After signing in:

1. Tap `SET AS ASSISTANT` and approve the Android role dialog.
2. Tap `ARM WAKE PHRASE` while the app is visible and approve microphone access.
3. Lock the screen and say “Hey English Drive”.

The native recognizer stops before the microphone transfers to the Gemini Live call. Arming is
held only in process memory. There is no boot receiver, sticky restart, or automatic re-arm after a
force-stop. See [`docs/android-assistant.md`](docs/android-assistant.md) for the lifecycle and
[`docs/realtime-flow.md`](docs/realtime-flow.md) for the M6 transport.
