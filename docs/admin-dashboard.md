# Admin dashboard

Open `/admin` on the API server (currently `http://103.195.238.176:3000/admin`).
This first dashboard is read-only: overview counts, paginated/searchable users and
sessions, session transcripts (first 500 messages) and analysis details. Provider
configuration is shown without API keys. Data refreshes on navigation or manually.

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
