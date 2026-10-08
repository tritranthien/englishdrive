# Admin dashboard

Open `/admin` on the API server (currently `http://103.195.238.176:3000/admin`).
The dashboard shows overview counts, paginated/searchable users and sessions,
session transcripts (first 500 messages) and analysis details. The API key section
lets admins replace Gemini/OpenAI keys, test the active key, or revert to the VPS
environment key. Existing keys are never returned to the browser.

The admin password is independent of mobile accounts. Set `ADMIN_PASSWORD_HASH`
to a bcrypt hash in `/etc/englishdrive.env`, and recreate the API container. In a
Compose env file, enclose bcrypt hashes in **single quotes** to preserve `$`.
Without this setting admin login is disabled. Never commit the password or hash.

Sessions use an HttpOnly, SameSite=Strict cookie, expire after eight hours and are
invalidated when the password hash changes. Login is limited to five attempts per
IP per 15 minutes in memory (reset on restart). Logout clears the browser cookie.
Mobile JWTs cannot access admin endpoints. After adding HTTPS, set
`ADMIN_COOKIE_SECURE=true`; leave it unset for the current HTTP-only server.

The dashboard is bundled as Nest assets, so the existing Docker deployment builds
and publishes it alongside the backend without a separate frontend server.

## API key storage

Set `API_KEYS_ENCRYPTION_KEY` in `/etc/englishdrive.env` to 32 random bytes encoded
as 64 hexadecimal characters (`openssl rand -hex 32`). Keep it outside the database
and back it up securely with the server environment. Do not rotate or lose it
without re-encrypting saved keys; otherwise startup fails rather than using a
different key silently.

Dashboard keys are encrypted with AES-256-GCM in PostgreSQL; the provider is
authenticated as part of the encrypted value. Saving commits to the database
before updating the current process. Dashboard overrides load before background
analysis starts and survive restarts/deploys. Existing VPS keys stay as fallbacks.
Reset removes the dashboard override; if no VPS key exists, that provider becomes
unconfigured. This implementation targets the current single API container;
multiple replicas would require broadcasting configuration changes.

Keys apply to new provider requests, not already established live sessions. A
connection test only checks access to the provider's model list; it does not
guarantee quota or access to a particular live model. Tests never return provider
response bodies or API keys. The current HTTP deployment does not encrypt browser
traffic; an SSH tunnel or HTTPS protects credentials in transit.
