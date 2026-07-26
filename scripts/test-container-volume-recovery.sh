#!/usr/bin/env bash
set -Eeuo pipefail

POSTGRES_IMAGE='postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777'
REDIS_IMAGE='redis:7-alpine@sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2'
PREFIX="tecpey-recovery-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
NETWORK="$PREFIX-network"
PG_SOURCE="$PREFIX-pg-source"
PG_RESTORE="$PREFIX-pg-restore"
REDIS_SOURCE="$PREFIX-redis-source"
REDIS_RESTORE="$PREFIX-redis-restore"
PG_PASSWORD='ephemeral-recovery-password'
REDIS_PASSWORD='ephemeral-recovery-redis-password'
EVIDENCE_DIR="${TECPEY_RECOVERY_EVIDENCE_DIR:-artifacts/container-recovery}"

cleanup() {
  docker rm -f "$PREFIX-pg" "$PREFIX-pg-restored" "$PREFIX-redis" "$PREFIX-redis-restored" >/dev/null 2>&1 || true
  docker volume rm "$PG_SOURCE" "$PG_RESTORE" "$REDIS_SOURCE" "$REDIS_RESTORE" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for() {
  local description="$1"
  shift
  for _ in $(seq 1 40); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "recovery_error=${description}_timeout" >&2
  return 1
}

mkdir -p "$EVIDENCE_DIR"
docker network create "$NETWORK" >/dev/null
for volume in "$PG_SOURCE" "$PG_RESTORE" "$REDIS_SOURCE" "$REDIS_RESTORE"; do
  docker volume create "$volume" >/dev/null
done

docker run -d --name "$PREFIX-pg" --network "$NETWORK" -e POSTGRES_USER=tecpey -e POSTGRES_DB=tecpey -e POSTGRES_PASSWORD="$PG_PASSWORD" -v "$PG_SOURCE:/var/lib/postgresql/data" "$POSTGRES_IMAGE" >/dev/null
wait_for postgres docker exec "$PREFIX-pg" pg_isready -U tecpey -d tecpey
docker exec "$PREFIX-pg" psql -U tecpey -d tecpey -v ON_ERROR_STOP=1 -c "CREATE TABLE recovery_sentinel (value text PRIMARY KEY); INSERT INTO recovery_sentinel VALUES ('issue-163');" >/dev/null
docker exec "$PREFIX-pg" pg_dump -U tecpey -d tecpey -Fc -f /tmp/tecpey.dump
docker cp "$PREFIX-pg:/tmp/tecpey.dump" "$EVIDENCE_DIR/postgres.dump"

docker run -d --name "$PREFIX-redis" --network "$NETWORK" -e REDIS_PASSWORD="$REDIS_PASSWORD" -v "$REDIS_SOURCE:/data" "$REDIS_IMAGE" sh -ec 'exec redis-server --appendonly no --requirepass "$REDIS_PASSWORD"' >/dev/null
wait_for redis docker exec "$PREFIX-redis" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping
docker exec "$PREFIX-redis" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SET issue:163 restored >/dev/null
docker exec "$PREFIX-redis" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE >/dev/null
docker cp "$PREFIX-redis:/data/dump.rdb" "$EVIDENCE_DIR/redis.rdb"

docker rm -f "$PREFIX-pg" "$PREFIX-redis" >/dev/null

docker run -d --name "$PREFIX-pg-restored" --network "$NETWORK" -e POSTGRES_USER=tecpey -e POSTGRES_DB=tecpey -e POSTGRES_PASSWORD="$PG_PASSWORD" -v "$PG_RESTORE:/var/lib/postgresql/data" "$POSTGRES_IMAGE" >/dev/null
wait_for postgres_restore docker exec "$PREFIX-pg-restored" pg_isready -h 127.0.0.1 -U tecpey -d tecpey
docker cp "$EVIDENCE_DIR/postgres.dump" "$PREFIX-pg-restored:/tmp/tecpey.dump"
docker exec "$PREFIX-pg-restored" pg_restore -h 127.0.0.1 -U tecpey -d tecpey --clean --if-exists /tmp/tecpey.dump
test "$(docker exec "$PREFIX-pg-restored" psql -h 127.0.0.1 -U tecpey -d tecpey -Atc 'SELECT value FROM recovery_sentinel')" = issue-163

docker create --name "$PREFIX-redis-restored" --network "$NETWORK" -e REDIS_PASSWORD="$REDIS_PASSWORD" -v "$REDIS_RESTORE:/data" "$REDIS_IMAGE" sh -ec 'exec redis-server --appendonly no --requirepass "$REDIS_PASSWORD"' >/dev/null
docker cp "$EVIDENCE_DIR/redis.rdb" "$PREFIX-redis-restored:/data/dump.rdb"
docker start "$PREFIX-redis-restored" >/dev/null
wait_for redis_restore docker exec "$PREFIX-redis-restored" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping
test "$(docker exec "$PREFIX-redis-restored" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning GET issue:163)" = restored

sha256sum "$EVIDENCE_DIR/postgres.dump" "$EVIDENCE_DIR/redis.rdb" > "$EVIDENCE_DIR/backup-digests.sha256"
printf '{"environment":"ephemeral-staging","postgres":"restored","redis":"restored"}\n' > "$EVIDENCE_DIR/result.json"
