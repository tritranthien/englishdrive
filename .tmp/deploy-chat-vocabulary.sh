#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=/opt/englishdrive
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'A deployment is already running'; exit 20; }
tag="chat-vocabulary-$(date -u +%Y%m%dT%H%M%SZ)"
release="$base/releases/$tag"
mkdir -p "$release"
tar -xzf /tmp/englishdrive-chat-vocabulary.tar.gz -C "$release"
chmod -R u=rwX,go=rX "$release"
previous_release=$(readlink -f "$base/current")
previous_image=$(docker inspect --format '{{.Config.Image}}' englishdrive-api-1)
previous_tag=${previous_image#englishdrive-api:}
docker build -f "$release/apps/api/Dockerfile" -t "englishdrive-api:$tag" "$release"
export DEPLOY_SHA="$tag"
if ! docker compose --env-file /etc/englishdrive.env -f "$release/deploy/compose.yml" up -d --no-deps --wait --wait-timeout 150 api; then
  DEPLOY_SHA="$previous_tag" docker compose --env-file /etc/englishdrive.env -f "$previous_release/deploy/compose.yml" up -d --no-deps --wait --wait-timeout 150 api
  exit 1
fi
ln -sfn "$release" "$base/current"
printf '%s\n' "$tag" > "$base/manual-chat-vocabulary-release"
echo "Chat vocabulary deployment healthy: $tag"
