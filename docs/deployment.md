# VPS auto deploy

The API and PostgreSQL run in Docker Compose on the VPS. A systemd timer checks
`git@github.com:tritranthien/englishdrive.git`, branch `main`, every minute after
the previous check finishes. It uses the VPS's existing GitHub SSH key; no inbound
GitHub webhook or extra GitHub Actions SSH secret is needed. Android APK releases
are separate from this backend deployment.

## Initial installation

On Ubuntu 22.04+, with root SSH access and GitHub in `known_hosts`:

```bash
bash deploy/bootstrap.sh
# Add provider keys to /etc/englishdrive.env (see deploy/.env.example).
systemctl start englishdrive-deploy.service
systemctl enable --now englishdrive-deploy.timer
```

Docker installation follows the [official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/).
The bootstrap generates separate database and JWT secrets and never overwrites
an existing environment file. Keep `/etc/englishdrive.env` readable only by root.
Use hexadecimal database passwords because the password is embedded in a URL.

## Deployment behavior

Push a commit to `main`. The service fetches its exact SHA, extracts a release,
builds the API image using the frozen pnpm lockfile, and runs API unit tests during
the image build. It backs up the database, runs `prisma migrate deploy`, starts
the new API and waits for `/health` to confirm database connectivity. Only a
healthy deployment is recorded in `/opt/englishdrive/deployed-sha`.

Build/test failures leave the running API unchanged. If the new API fails its
health check, the previous API image and Compose configuration are restarted.
Database migrations are **not** automatically reversed: migrations must remain
compatible with the previous API. A failed revision is retried on the next timer
tick. The first deployment has no earlier API to restore.

Backups are in `/opt/englishdrive/backups` and retained for 14 days after successful
deploys. They are local backups; copy them off the VPS for disaster recovery.
Old tagged images and release directories are retained for rollback. Monitor disk
space and remove obsolete releases/images explicitly. Build cache older than a
week is pruned after successful deployment. Container log rotation is enabled.

## Operations

```bash
systemctl list-timers englishdrive-deploy.timer
journalctl -u englishdrive-deploy.service -n 100 --no-pager
curl --fail http://127.0.0.1:3000/health
systemctl start englishdrive-deploy.service  # check main immediately
systemctl stop englishdrive-deploy.timer    # pause auto deploy
/usr/local/sbin/englishdrive-deploy --force  # reapply env changes at same SHA
```

The API initially binds to `127.0.0.1:3000`; PostgreSQL has no public port.
Configure an HTTPS reverse proxy for your domain before mobile production use.
For the current IP-only installation, `/etc/englishdrive.env` sets
`API_BIND_ADDRESS=0.0.0.0`, exposing `http://103.195.238.176:3000` without TLS.
For local access through the existing SSH alias:

```bash
ssh -L 3000:127.0.0.1:3000 vps
```

To manually restore an older application, stop the timer, set `DEPLOY_SHA` to its
SHA, and run the matching Compose release (check migration compatibility first):

```bash
systemctl stop englishdrive-deploy.timer
systemctl stop englishdrive-deploy.service
export DEPLOY_SHA=THE_PREVIOUS_FULL_COMMIT_SHA
docker compose --env-file /etc/englishdrive.env \
  -f /opt/englishdrive/releases/$DEPLOY_SHA/deploy/compose.yml \
  up -d --wait api
```

Keep the timer paused until a corrective commit is pushed. On resume the timer
targets `main` again. Changes to the systemd units or the deployment driver itself
require rerunning `deploy/bootstrap.sh` from the reviewed release; the service
does not replace its own executable from GitHub automatically.
