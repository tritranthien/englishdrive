#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=/opt/englishdrive
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Another deployment holds the lock'; exit 20; }
timer_was_active=false
if systemctl is-active --quiet englishdrive-deploy.timer; then
  timer_was_active=true
  systemctl stop englishdrive-deploy.timer
fi
tag="video-chat-audio-$(date -u +%Y%m%dT%H%M%SZ)"
release="$base/releases/$tag"
previous_release=$(readlink -f "$base/current")
previous_image=$(docker inspect --format '{{.Image}}' englishdrive-api-1)
previous_transcription=$(docker inspect --format '{{.Image}}' englishdrive-transcription-1 2>/dev/null || true)
rollback_tag="rollback-$tag"
switched=false
finished=false
export DEPLOY_SHA="$tag"
compose() {
  docker compose --env-file /etc/englishdrive.env -f "$release/deploy/compose.yml" "$@"
}
finish() {
  result=$?
  trap - EXIT
  if [[ "$finished" != true && "$switched" == true ]]; then
    echo 'Restoring the previous API image.'
    if [[ -n "$previous_transcription" ]]; then
      DEPLOY_SHA="$rollback_tag" docker compose --env-file /etc/englishdrive.env \
        -f "$previous_release/deploy/compose.yml" up -d --no-deps --wait --wait-timeout 150 transcription api || true
    else
      DEPLOY_SHA="$rollback_tag" docker compose --env-file /etc/englishdrive.env \
        -f "$previous_release/deploy/compose.yml" up -d --no-deps --wait --wait-timeout 150 api || true
      compose stop transcription || true
    fi
  fi
  if [[ "$timer_was_active" == true ]]; then
    systemctl start englishdrive-deploy.timer
  fi
  exit "$result"
}
trap finish EXIT
mkdir -p "$release" "$base/backups"
tar -xzf /tmp/englishdrive-video-chat-audio.tar.gz -C "$release"
chmod -R u=rwX,go=rX "$release"
docker image tag "$previous_image" "englishdrive-api:$rollback_tag"
if [[ -n "$previous_transcription" ]]; then
  docker image tag "$previous_transcription" "englishdrive-transcription:$rollback_tag"
fi
printf 'tag=%s\nprevious_release=%s\nrollback_image=%s\n' "$tag" "$previous_release" "englishdrive-api:$rollback_tag" > "$base/manual-video-chat-audio-state"
echo "Building API and transcription images: $tag"
docker build -f "$release/apps/api/Dockerfile" -t "englishdrive-api:$tag" "$release"
docker build -f "$release/services/transcription/Dockerfile" -t "englishdrive-transcription:$tag" "$release"
backup="$base/backups/$(date -u +%Y%m%dT%H%M%SZ)-$tag.sql.gz"
docker exec englishdrive-postgres-1 pg_dump -U english_drive english_drive | gzip > "$backup"
test -s "$backup"
gzip -t "$backup"
echo 'Database backup verified.'
compose config --quiet
compose run --rm --no-deps api pnpm exec prisma migrate deploy
switched=true
compose up -d --no-deps --wait --wait-timeout 180 transcription
compose up -d --no-deps --wait --wait-timeout 180 api
curl --fail --silent --show-error http://127.0.0.1:3000/health
docker exec englishdrive-transcription-1 python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"
ln -sfn "$release" "$base/current"
printf '%s\n' "$tag" > "$base/manual-video-chat-audio-release"
finished=true
echo "Deployment healthy: $tag"
docker ps
free -m
df -h /
