# Offline Sync Batch Telemetry Classification

Status: **P0 cleanup inventory**  
Issue: **#208**  
Parents: **#161, #100, #156**  
Inventory base: **`00fcdc8494354892c68cb6d38dcfdcca4dbb91b4`**

## Authority boundary

Offline Sync command state, replay/conflict handling and learning-event application are already owned by `processOfflineSyncCommand()` and its PostgreSQL transaction. The route-level batch counters cannot prove those mutations because they are emitted after independent command commits.

## Classification

The batch summary is operational telemetry only. It may contain bounded attempted/committed/replayed/rejected/retryable counts plus domain-separated student and tenant fingerprints. It must not contain raw student ID, tenant ID, IP, user-agent, scope token, command ID, payload or browser queue content.

## Required route behavior

- preserve strict session, signed principal scope, CSRF, rate limit, bounded body, multi-status and explicit storage-unavailable behavior;
- remove legacy `writeAudit({ action: "offline_sync" })`;
- remove IP/user-agent collection used solely for that audit;
- emit one structured logger event after the command results are classified;
- keep command mutation evidence entirely in the canonical Offline Sync authority.

## Permanent guard

The Offline Sync source guard must reject route-side `writeAudit()`, `getClientIp`, user-agent access, raw identity fields in telemetry and direct learning-event persistence. Focused and full suites must execute the guard.