#!/usr/bin/env bash
set -Eeuo pipefail

POSTGRES_IMAGE='postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777'
REDIS_IMAGE='redis:7-alpine@sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2'
MIGRATION_IMAGE="${1:?usage: test-container-volume-recovery.sh <exact-candidate-image>}"
PREFIX="tecpey-recovery-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
NETWORK="$PREFIX-network"
PG_SOURCE="$PREFIX-pg-source"
PG_RESTORE="$PREFIX-pg-restore"
REDIS_SOURCE="$PREFIX-redis-source"
REDIS_RESTORE="$PREFIX-redis-restore"
PG_PASSWORD='ephemeral-recovery-password'
REDIS_PASSWORD='ephemeral-recovery-redis-password'
EVIDENCE_DIR="${TECPEY_RECOVERY_EVIDENCE_DIR:-artifacts/container-recovery}"
MAX_RECOVERY_SECONDS="${TECPEY_RECOVERY_RTO_SECONDS:-300}"
SOURCE_SHA="$(git rev-parse HEAD)"
EXPECTED_SOURCE_SHA="${TECPEY_RECOVERY_SOURCE_SHA:-$SOURCE_SHA}"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STARTED_MS="$(date +%s%3N)"

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

extract_migration_result() {
  local log_file="$1"
  node -e '
    const fs = require("node:fs");
    const lines = fs.readFileSync(process.argv[1], "utf8").trim().split(/\r?\n/);
    const value = JSON.parse(lines.at(-1));
    if (value.status !== "ok" || value.schema !== "current" || !/^[a-f0-9]{64}$/.test(value.planHash)) {
      throw new Error("migration evidence is not current");
    }
    process.stdout.write(JSON.stringify(value));
  ' "$log_file"
}

run_migrations() {
  local database_host="$1"
  local output_file="$2"
  docker run --rm \
    --network "$NETWORK" \
    --env "DATABASE_URL=postgresql://tecpey:${PG_PASSWORD}@${database_host}:5432/tecpey" \
    --entrypoint node \
    "$MIGRATION_IMAGE" \
    dist/run-database-migrations.cjs | tee "$output_file"
}

if ! [[ "$MAX_RECOVERY_SECONDS" =~ ^[1-9][0-9]*$ ]] || [ "$MAX_RECOVERY_SECONDS" -gt 900 ]; then
  echo "recovery_error=invalid_rto_seconds" >&2
  exit 1
fi
if ! [[ "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]]; then
  echo "recovery_error=invalid_source_sha" >&2
  exit 1
fi
if ! [[ "$EXPECTED_SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]] || [ "$SOURCE_SHA" != "$EXPECTED_SOURCE_SHA" ]; then
  echo "recovery_error=source_sha_mismatch" >&2
  exit 1
fi
ARTIFACTS_ROOT="$(realpath -m -- artifacts)"
CANONICAL_EVIDENCE_DIR="$(realpath -m -- "$EVIDENCE_DIR")"
case "$CANONICAL_EVIDENCE_DIR" in
  "$ARTIFACTS_ROOT"/*) ;;
  *)
    echo "recovery_error=evidence_dir_must_be_under_artifacts" >&2
    exit 1
    ;;
esac

mkdir -p -- "$CANONICAL_EVIDENCE_DIR"
EVIDENCE_DIR="$(realpath -e -- "$CANONICAL_EVIDENCE_DIR")"
case "$EVIDENCE_DIR" in
  "$ARTIFACTS_ROOT"/*) ;;
  *)
    echo "recovery_error=evidence_dir_must_be_under_artifacts" >&2
    exit 1
    ;;
esac
rm -f \
  "$EVIDENCE_DIR/source-migration.log" \
  "$EVIDENCE_DIR/restored-migration.log" \
  "$EVIDENCE_DIR/postgres.dump" \
  "$EVIDENCE_DIR/redis.rdb" \
  "$EVIDENCE_DIR/backup-digests.sha256" \
  "$EVIDENCE_DIR/result.json"
docker image inspect "$MIGRATION_IMAGE" >/dev/null
IMAGE_ID="$(docker image inspect "$MIGRATION_IMAGE" --format '{{.Id}}')"
docker network create "$NETWORK" >/dev/null
for volume in "$PG_SOURCE" "$PG_RESTORE" "$REDIS_SOURCE" "$REDIS_RESTORE"; do
  docker volume create "$volume" >/dev/null
done

docker run -d \
  --name "$PREFIX-pg" \
  --network "$NETWORK" \
  --env POSTGRES_USER=tecpey \
  --env POSTGRES_DB=tecpey \
  --env POSTGRES_PASSWORD="$PG_PASSWORD" \
  --volume "$PG_SOURCE:/var/lib/postgresql/data" \
  "$POSTGRES_IMAGE" >/dev/null
wait_for postgres docker exec "$PREFIX-pg" psql -h 127.0.0.1 -U tecpey -d tecpey -Atc 'SELECT 1'
run_migrations "$PREFIX-pg" "$EVIDENCE_DIR/source-migration.log"
SOURCE_MIGRATION="$(extract_migration_result "$EVIDENCE_DIR/source-migration.log")"
SOURCE_PLAN_HASH="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).planHash)' "$SOURCE_MIGRATION")"
docker exec "$PREFIX-pg" psql -U tecpey -d tecpey -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE operational_recovery_probe (id text PRIMARY KEY, value text NOT NULL);
   INSERT INTO operational_recovery_probe VALUES ('before-backup', 'committed-before-backup');" >/dev/null

BACKUP_STARTED_MS="$(date +%s%3N)"
docker exec "$PREFIX-pg" pg_dump -U tecpey -d tecpey -Fc -f /tmp/tecpey.dump
docker cp "$PREFIX-pg:/tmp/tecpey.dump" "$EVIDENCE_DIR/postgres.dump"
docker exec "$PREFIX-pg" psql -U tecpey -d tecpey -v ON_ERROR_STOP=1 -c \
  "INSERT INTO operational_recovery_probe VALUES ('after-backup', 'must-not-be-restored');" >/dev/null

docker run -d \
  --name "$PREFIX-redis" \
  --network "$NETWORK" \
  --env REDIS_PASSWORD="$REDIS_PASSWORD" \
  --volume "$REDIS_SOURCE:/data" \
  "$REDIS_IMAGE" \
  sh -ec 'exec redis-server --appendonly no --requirepass "$REDIS_PASSWORD"' >/dev/null
wait_for redis docker exec "$PREFIX-redis" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping
docker exec "$PREFIX-redis" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning \
  SET recovery:before-backup committed-before-backup >/dev/null
docker exec "$PREFIX-redis" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE >/dev/null
docker cp "$PREFIX-redis:/data/dump.rdb" "$EVIDENCE_DIR/redis.rdb"
docker exec "$PREFIX-redis" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning \
  SET recovery:after-backup must-not-be-restored >/dev/null
BACKUP_COMPLETED_MS="$(date +%s%3N)"

sha256sum "$EVIDENCE_DIR/postgres.dump" "$EVIDENCE_DIR/redis.rdb" > "$EVIDENCE_DIR/backup-digests.sha256"
POSTGRES_DIGEST="$(sha256sum "$EVIDENCE_DIR/postgres.dump" | cut -d' ' -f1)"
REDIS_DIGEST="$(sha256sum "$EVIDENCE_DIR/redis.rdb" | cut -d' ' -f1)"
docker rm -f "$PREFIX-pg" "$PREFIX-redis" >/dev/null

RESTORE_STARTED_MS="$(date +%s%3N)"
docker run -d \
  --name "$PREFIX-pg-restored" \
  --network "$NETWORK" \
  --env POSTGRES_USER=tecpey \
  --env POSTGRES_DB=tecpey \
  --env POSTGRES_PASSWORD="$PG_PASSWORD" \
  --volume "$PG_RESTORE:/var/lib/postgresql/data" \
  "$POSTGRES_IMAGE" >/dev/null
wait_for postgres_restore docker exec "$PREFIX-pg-restored" psql -h 127.0.0.1 -U tecpey -d tecpey -Atc 'SELECT 1'
docker cp "$EVIDENCE_DIR/postgres.dump" "$PREFIX-pg-restored:/tmp/tecpey.dump"
docker exec "$PREFIX-pg-restored" pg_restore \
  -h 127.0.0.1 -U tecpey -d tecpey --clean --if-exists /tmp/tecpey.dump
test "$(docker exec "$PREFIX-pg-restored" psql -h 127.0.0.1 -U tecpey -d tecpey -Atc \
  "SELECT value FROM operational_recovery_probe WHERE id = 'before-backup'")" = committed-before-backup
test "$(docker exec "$PREFIX-pg-restored" psql -h 127.0.0.1 -U tecpey -d tecpey -Atc \
  "SELECT COUNT(*) FROM operational_recovery_probe WHERE id = 'after-backup'")" = 0
run_migrations "$PREFIX-pg-restored" "$EVIDENCE_DIR/restored-migration.log"
RESTORED_MIGRATION="$(extract_migration_result "$EVIDENCE_DIR/restored-migration.log")"
RESTORED_PLAN_HASH="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).planHash)' "$RESTORED_MIGRATION")"
test "$SOURCE_PLAN_HASH" = "$RESTORED_PLAN_HASH"

docker create \
  --name "$PREFIX-redis-restored" \
  --network "$NETWORK" \
  --env REDIS_PASSWORD="$REDIS_PASSWORD" \
  --volume "$REDIS_RESTORE:/data" \
  "$REDIS_IMAGE" \
  sh -ec 'exec redis-server --appendonly no --requirepass "$REDIS_PASSWORD"' >/dev/null
docker cp "$EVIDENCE_DIR/redis.rdb" "$PREFIX-redis-restored:/data/dump.rdb"
docker start "$PREFIX-redis-restored" >/dev/null
wait_for redis_restore docker exec "$PREFIX-redis-restored" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping
test "$(docker exec "$PREFIX-redis-restored" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning \
  GET recovery:before-backup)" = committed-before-backup
test "$(docker exec "$PREFIX-redis-restored" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning \
  EXISTS recovery:after-backup)" = 0

RESTORE_COMPLETED_MS="$(date +%s%3N)"
COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BACKUP_DURATION_MS="$((BACKUP_COMPLETED_MS - BACKUP_STARTED_MS))"
RECOVERY_DURATION_MS="$((RESTORE_COMPLETED_MS - RESTORE_STARTED_MS))"
TOTAL_DURATION_MS="$((RESTORE_COMPLETED_MS - STARTED_MS))"
if [ "$RECOVERY_DURATION_MS" -gt "$((MAX_RECOVERY_SECONDS * 1000))" ]; then
  echo "recovery_error=rto_exceeded:${RECOVERY_DURATION_MS}ms" >&2
  exit 1
fi

node - "$EVIDENCE_DIR/result.json" \
  "$SOURCE_SHA" "$IMAGE_ID" "$STARTED_AT" "$COMPLETED_AT" \
  "$MAX_RECOVERY_SECONDS" "$BACKUP_DURATION_MS" "$RECOVERY_DURATION_MS" "$TOTAL_DURATION_MS" \
  "$SOURCE_MIGRATION" "$RESTORED_MIGRATION" "$POSTGRES_DIGEST" "$REDIS_DIGEST" <<'NODE'
const fs = require("node:fs");
const [
  output, sourceSha, imageId, startedAt, completedAt, maxRecoverySeconds,
  backupDurationMs, recoveryDurationMs, totalDurationMs,
  sourceMigration, restoredMigration, postgresSha256, redisSha256,
] = process.argv.slice(2);
const evidence = {
  schemaVersion: 1,
  authority: "tecpey-operational-recovery-drill-v1",
  environment: "ephemeral-ci",
  sourceSha,
  imageId,
  startedAt,
  completedAt,
  objectives: {
    maximumRecoverySeconds: Number(maxRecoverySeconds),
    backupDurationMs: Number(backupDurationMs),
    recoveryDurationMs: Number(recoveryDurationMs),
    totalDurationMs: Number(totalDurationMs),
    rpoBoundary: "all-probe-writes-committed-before-backup-are-present-and-later-writes-are-absent",
  },
  postgres: {
    sourceMigration: JSON.parse(sourceMigration),
    restoredMigration: JSON.parse(restoredMigration),
    committedBeforeBackupPresent: true,
    committedAfterBackupAbsent: true,
    backupSha256: postgresSha256,
  },
  redis: {
    committedBeforeBackupPresent: true,
    committedAfterBackupAbsent: true,
    backupSha256: redisSha256,
  },
};
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
NODE

node scripts/verify-operational-recovery-evidence.mjs "$EVIDENCE_DIR/result.json" \
  --expected-sha "$SOURCE_SHA"
