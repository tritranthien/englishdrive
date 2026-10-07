#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=/opt/englishdrive
mkdir -p "$base/releases" "$base/backups"
exec 9>"$base/deploy.lock"
flock -n 9 || exit 0
export GIT_SSH_COMMAND='ssh -o BatchMode=yes -o StrictHostKeyChecking=yes'
git --git-dir="$base/repo.git" fetch origin refs/heads/main:refs/heads/main
sha=$(git --git-dir="$base/repo.git" rev-parse refs/heads/main)
previous=$(cat "$base/deployed-sha" 2>/dev/null || true)
if [[ "$sha" == "$previous" && "${1:-}" != --force ]]; then
  exit 0
fi
echo "Deploying $sha (previous: ${previous:-none})"
release="$base/releases/$sha"
mkdir -p "$release"
git --git-dir="$base/repo.git" archive "$sha" | tar -x -C "$release"
export DEPLOY_SHA="$sha"
compose() {
  docker compose --env-file /etc/englishdrive.env -f "$release/deploy/compose.yml" "$@"
}
docker build -f "$release/apps/api/Dockerfile" -t "englishdrive-api:$sha" "$release"
compose up -d --wait --wait-timeout 120 postgres
backup="$base/backups/$(date -u +%Y%m%dT%H%M%SZ)-$sha.sql.gz"
compose exec -T postgres pg_dump -U english_drive english_drive | gzip > "$backup"
compose run --rm --no-deps api pnpm exec prisma migrate deploy
if ! compose up -d --wait --wait-timeout 150 api; then
  echo 'API failed its health check.' >&2
  if [[ -n "$previous" ]]; then
    echo "Restoring previous application $previous; database migrations remain applied." >&2
    DEPLOY_SHA="$previous" docker compose --env-file /etc/englishdrive.env \
      -f "$base/releases/$previous/deploy/compose.yml" up -d --wait --wait-timeout 150 api
  fi
  exit 1
fi
printf '%s\n' "$sha" > "$base/deployed-sha.tmp"
mv "$base/deployed-sha.tmp" "$base/deployed-sha"
ln -sfn "$release" "$base/current"
# Keep bounded backup/cache storage on the small VPS. Tagged release images are
# retained for manual rollback; remove old ones explicitly after review.
find "$base/backups" -maxdepth 1 -type f -name '*.sql.gz' -mtime +14 -delete
docker builder prune -f --filter until=168h >/dev/null
echo "Deployment healthy: $sha"
