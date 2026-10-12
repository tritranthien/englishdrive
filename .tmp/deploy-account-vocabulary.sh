#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=/opt/englishdrive
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'A deployment is already running'; exit 20; }
tag="vocabulary-$(date -u +%Y%m%dT%H%M%SZ)"
release="$base/releases/$tag"
mkdir -p "$release" "$base/backups"
tar -xzf /tmp/englishdrive-account-vocabulary.tar.gz -C "$release"
docker build -f "$release/apps/api/Dockerfile" -t "englishdrive-api:$tag" "$release"
previous_release=$(readlink -f "$base/current")
previous_image=$(docker inspect --format '{{.Config.Image}}' englishdrive-api-1)
previous_tag=${previous_image#englishdrive-api:}
export DEPLOY_SHA="$tag"
compose() { docker compose --env-file /etc/englishdrive.env -f "$release/deploy/compose.yml" "$@"; }
backup="$base/backups/$(date -u +%Y%m%dT%H%M%SZ)-vocabulary.sql.gz"
compose exec -T postgres pg_dump -U english_drive english_drive | gzip > "$backup"
compose run --rm --no-deps api pnpm exec prisma migrate deploy
if ! compose up -d --no-deps --wait --wait-timeout 150 api; then
  DEPLOY_SHA="$previous_tag" docker compose --env-file /etc/englishdrive.env -f "$previous_release/deploy/compose.yml" up -d --no-deps --wait --wait-timeout 150 api
  exit 1
fi
ln -sfn "$release" "$base/current"
printf '%s\n' "$tag" > "$base/manual-vocabulary-release"
echo "Account vocabulary deployment healthy: $tag"
