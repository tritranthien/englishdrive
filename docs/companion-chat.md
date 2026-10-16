# Companion messaging

The **Tin nhắn** tab contains private conversations with fictional adult AI friends and groups
with 2–6 characters. Twelve versioned templates are served from the API; adding one copies its
profile into the signed-in account. Custom profiles and edits are private to that account.
Templates are not duplicated on application startup and do not require a separate seed command.

## Behavior

- Chat is in English at the learner's level (B1 when unknown). Translation and explanations
  are in Vietnamese. Suggested replies populate the draft and are never sent automatically.
- Dating is opt-in for each direct thread; group conversations are platonic.
- A group generates 2–4 short messages from at least two members, then stops. Direct threads
  generate 1–2 messages. Content concerns fictional everyday events, not verified current news.
- Context uses only the thread's memory and latest 30 messages. Every 20 new messages, up to
  100 unsummarized messages extend the memory. Private-thread messages are not group context.
- Global defaults: 120–360 minutes per thread, six proactive bursts per account/local day,
  quiet hours 22:00–08:00 in Asia/Ho_Chi_Minh. Settings can use the device's timezone instead.
  Equal quiet-hour endpoints disable quiet hours. Each chat can inherit or override intervals.
- Two unread proactive bursts pause that thread until it is read or answered. There is no
  catch-up burst after downtime. Quiet hours and daily caps do not block user-triggered replies.
- The Android SQLite cache keeps the latest 200 loaded messages per thread, drafts and an
  account-scoped persistent outbox. Retries retain client IDs. Cached messages are available offline.
- An open chat polls every 3 seconds; inbox synchronization runs every 20 seconds while active.
  The server remains the source of truth; push delivery is not used as message storage.

## Backend and jobs

Run `pnpm db:generate`, deploy migrations, and restart the API. The additive migration
`20261017000000_companion_chat` does not modify existing learning or voice data.
`GEMINI_CHAT_MODEL` defaults to `GEMINI_ANALYSIS_MODEL`; `GEMINI_API_KEY` remains server-side.

`CHAT_PROACTIVE_ENABLED=true` enables the scheduler (off by default for rollout). Users still
control their own master switch. The worker handles user replies regardless of this flag.
The scheduler runs every 30 seconds; the worker claims up to two jobs every two seconds.
PostgreSQL locks serialize short claims across API instances and prevent concurrent jobs in
one thread. Leases expire after 120 seconds; AI requests time out after 30 seconds. Jobs retry
up to three times; failed replies expose an explicit retry action. Message persistence, thread
sequence allocation and creation of the push outbox job occur in one transaction.

All `/chat/*` routes require the existing Bearer token and ownership checks:

| Routes | Purpose |
| --- | --- |
| `GET /chat/status`, `/chat/catalog` | Capabilities and character templates |
| `GET/POST /chat/characters`, `PATCH /chat/characters/:id` | Owned character profiles |
| `GET/PATCH /chat/preferences` | Account schedule and timezone |
| `GET/POST /chat/threads`, `GET/PATCH /chat/threads/:id` | Direct/group conversations and options |
| `GET/POST /chat/threads/:id/messages` | Cursor history and idempotent sends |
| `POST /chat/threads/:id/read`, `/retry`, `/help` | Read cursor, failed response retry, learning help |
| `POST /chat/devices`, `DELETE /chat/devices/:installationId` | Bind/unbind a push installation |

History accepts `before` or `after` sequence cursors, returns at most 50 messages and `hasMore`.
Messages have a stable ID, per-thread sequence, role, optional character ID and creation time.
Client sends require a UUID `clientMessageId`; repeated sends return the existing message.
Live message pages also expose reply job status. The server limits user sends to 20/thread/minute
and help requests to 60/account/hour, with successful help results cached by action and message.

## Firebase setup (required for background notifications)

Chat works without Firebase. Background push cannot be verified until the following configuration
is supplied; the app explicitly reports when push or the proactive scheduler is unavailable.

1. Create a Firebase project in the [Firebase console](https://console.firebase.google.com/).
   Google Analytics is optional. Add an Android app with package **`com.englishdrive`**.
2. Download `google-services.json` to **`apps/mobile/android/app/google-services.json`**.
   It is ignored by Git. Gradle reads its Firebase app ID, project ID, sender ID and Android
   API key into BuildConfig. Native initialization uses these options; no Google Services
   Gradle plugin or Firebase JS dependency is needed. Rebuild the APK after adding the file.
3. In Google Cloud, enable **Firebase Cloud Messaging API (HTTP v1)**. Under Firebase Project
   settings → Service accounts, create a service-account key with permission to send FCM messages.
   Keep this private JSON on the VPS only, never inside an APK or committed to Git.
4. The Compose API container mounts `/etc/englishdrive-secrets` read-only. Its runtime user is
   uid/gid 1000. Provision the directory and key with these permissions:

   ```bash
   install -d -o root -g 1000 -m 0750 /etc/englishdrive-secrets
   # Transfer the downloaded key securely, then:
   chown root:1000 /etc/englishdrive-secrets/firebase-service-account.json
   chmod 0640 /etc/englishdrive-secrets/firebase-service-account.json
   ```

5. Add to `/etc/englishdrive.env`, without printing the key in logs:

   ```dotenv
   GOOGLE_APPLICATION_CREDENTIALS=/run/englishdrive-secrets/firebase-service-account.json
   CHAT_PROACTIVE_ENABLED=true
   ```

   Redeploy/recreate the API container so environment and the read-only mount apply.
6. Install the newly configured APK, sign in, and open **Cài đặt → Bạn bè & tin nhắn →
   Cho phép thông báo tin nhắn**. Verify the global Android notification permission and the
   **Tin nhắn từ bạn bè** channel are enabled. On Xiaomi, allow background notifications/autostart
   if required by the device's battery policy.
7. Test an actual response with the app in the background, then tap the notification. Test an
   unread group burst, permission denial and logout/account switching. Force-stopping the app
   in Android settings requires reopening it before FCM delivery resumes.

The server uses FCM HTTP v1 with service-account OAuth, a five-minute notification TTL and
one thread-tagged notification per burst. Invalid registration tokens are removed. An account
switch rebinds the installation; logout detaches it and deletes the native Firebase token.
Foreground notifications are suppressed for the currently visible thread. Cold/warm notification
opens are retained until authentication/navigation is ready, then checked against server ownership.

Official references: [Android setup](https://firebase.google.com/docs/android/setup),
[receiving messages](https://firebase.google.com/docs/cloud-messaging/android/receive-messages),
[HTTP v1 authorization](https://firebase.google.com/docs/cloud-messaging/send/v1-api).

## Verification

Run mobile tests/typecheck, backend tests/typecheck and a release Android build. PostgreSQL
integration tests are enabled only by `CHAT_TEST_DATABASE_URL`; this must name a disposable
database with migrations already applied. They never fall back to the application's `.env` URL.

```powershell
# Example isolated test database (remove only after verification):
docker run -d --name englishdrive-chat-tests -e POSTGRES_PASSWORD=local-test-only -e POSTGRES_DB=chat_test -p 127.0.0.1:55432:5432 postgres:17-alpine
$env:DATABASE_URL = 'postgresql://postgres:local-test-only@127.0.0.1:55432/chat_test'
$env:CHAT_TEST_DATABASE_URL = $env:DATABASE_URL
corepack pnpm --filter @english-drive/api exec prisma migrate deploy
corepack pnpm --filter @english-drive/api test
corepack pnpm --filter @english-drive/mobile test
corepack pnpm --filter @english-drive/mobile typecheck
```
