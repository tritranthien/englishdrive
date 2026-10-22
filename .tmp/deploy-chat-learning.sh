#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=/opt/englishdrive
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'A deployment is already running'; exit 20; }
tag="chat-learning-$(date -u +%Y%m%dT%H%M%SZ)"
release="$base/releases/$tag"
previous_release=$(readlink -f "$base/current")
previous_image=$(docker inspect --format '{{.Config.Image}}' englishdrive-api-1)
previous_tag=${previous_image#englishdrive-api:}
mkdir -p "$release" "$base/backups"
cp -a "$previous_release/." "$release/"
tar -xzf /tmp/englishdrive-chat-learning.tar.gz -C "$release"
docker build -f "$release/apps/api/Dockerfile" -t "englishdrive-api:$tag" "$release"
export DEPLOY_SHA="$tag"
compose() { docker compose --env-file /etc/englishdrive.env -f "$release/deploy/compose.yml" "$@"; }
test_db="chat_learning_verify_$(date -u +%Y%m%d%H%M%S)"
compose exec -T postgres createdb -U english_drive "$test_db"
cleanup_test() { compose exec -T postgres dropdb --if-exists -U english_drive "$test_db"; }
trap cleanup_test EXIT
compose run --rm --no-deps -e CHAT_VERIFY_DATABASE="$test_db" api node --input-type=module -e '
  import { spawnSync } from "node:child_process";
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/" + process.env.CHAT_VERIFY_DATABASE;
  const env = { ...process.env, DATABASE_URL: url.toString(), CHAT_TEST_DATABASE_URL: url.toString() };
  for (const args of [["exec", "prisma", "migrate", "deploy"], ["test", "--maxWorkers=1", "chat"]]) {
    const result = spawnSync("pnpm", args, { env, stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
'
cleanup_test
trap - EXIT
backup="$base/backups/$(date -u +%Y%m%dT%H%M%SZ)-chat-learning.sql.gz"
compose exec -T postgres pg_dump -U english_drive english_drive | gzip > "$backup"
compose run --rm --no-deps api pnpm exec prisma migrate deploy
if ! compose up -d --no-deps --wait --wait-timeout 150 api; then
  DEPLOY_SHA="$previous_tag" docker compose --env-file /etc/englishdrive.env -f "$previous_release/deploy/compose.yml" up -d --no-deps --wait --wait-timeout 150 api
  exit 1
fi
ln -sfn "$release" "$base/current"
printf '%s\n' "$tag" > "$base/manual-chat-learning-release"
echo "Chat learning deployment healthy: $tag"
