# Production deployment and supply-chain contract

## Immutable artifact

The production web image is built from digest-pinned bases. The custom server is
compiled during the builder stage; the rootless runtime contains the compiled
server, Next build output, public assets, and production dependencies only. It
does not contain `tsx`, TypeScript, source migration modules, or builder
dependencies. `/app/storage`, `/app/.next/cache`, and `/tmp` are the only
governed writable paths.

Every external GitHub Action and CI service image is pinned to an immutable
commit or digest. Updating a pin requires reviewing the upstream release,
updating the authority test, and retaining a green exact-head workflow run.

## Production sequence

Set `TECPEY_IMAGE_DIGEST` (a reviewed `sha256:...` release digest),
`POSTGRES_PASSWORD`, and `REDIS_PASSWORD` through the
approved secret manager. Compose rejects absent values and contains no defaults.
PostgreSQL and authenticated Redis run only on the internal backend network.

1. Build the exact release image.
2. Run the one-shot `migrate` service after PostgreSQL and Redis are healthy.
3. Start `tecpey-web` only after migration exits successfully.
4. Route traffic only when `/api/health` returns HTTP 200 with PostgreSQL `ok`,
   schema `current`, Redis `ok`, runtime `ready`, and required workers either
   `ready` or governed `disabled`.
5. Use `/api/health/live` only for process liveness. It does not authorize traffic.

Redis authentication is mandatory even on the isolated private backend network.
TLS must be terminated by the approved private network/service mesh when traffic
leaves a single protected host; public Redis exposure is prohibited.

## Shutdown

SIGINT and SIGTERM first remove HTTP readiness and stop accepting connections.
HTTP requests and WebSockets receive a bounded ten-second drain window. Remaining
connections are force-closed only at the deadline. Workers then stop before Redis
sessions close, preserving command ownership and avoiding duplicate execution.

## Evidence and recovery

The container supply-chain workflow records the exact image digest, SPDX SBOM,
critical/high vulnerability result, build provenance, and signature evidence.
Evidence names include the exact source SHA and is retained with the workflow.

Before production promotion, the Release Operator performs the protected staging
rollback and persistent-volume restore drill:

1. record the current and candidate immutable image digests;
2. back up PostgreSQL and Redis volumes using the approved encrypted backup path;
3. deploy the candidate, run migrations, and verify readiness;
4. write a non-secret sentinel record and capture its checksum;
5. stop the stack, restore both volumes into isolated replacement volumes, and
   verify the sentinel plus migration plan hash;
6. redeploy the previous digest, require fail-closed compatibility/readiness, then
   return to the candidate digest through the documented forward-fix path;
7. retain timestamps, operator identity, image digests, volume backup digests,
   health output, and recovery duration without retaining credentials or data.

An unsuccessful migration, rollback, or restore is a release failure. Destructive
production restore is never used as a test; drills use isolated staging volumes.
