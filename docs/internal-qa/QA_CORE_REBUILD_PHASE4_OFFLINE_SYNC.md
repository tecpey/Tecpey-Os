# TecPey Core Rebuild Phase 4 — Offline-first + Sync Engine Foundation

## Scope
- Added `/api/offline-sync` as the shared web/mobile sync endpoint.
- Added a normalized offline event contract for Web / Android / iOS / PWA.
- Added client-side offline queue manager with automatic sync on online/focus/interval.
- Added `/academy/offline-ready` private documentation page for testing the offline capability model.

## Product rules
- Offline allowed: saved lessons, notes, practice journal, replay practice, notification-open events.
- Online required: login, final exam, certificate issue/verify, rankings, live AI mentor, live market.
- Server-only events are rejected if sent from client/offline queue.

## RedTeam checks
- `certificate_issued`, `term_unlocked`, `badge_earned`, `rank_changed` are not accepted from offline client queue.
- Payload size is capped.
- Batch size is capped.
- Auth/profile session is required before sync.
- Local storage fallback is limited to localhost/dev or explicit env flag.

## Mobile readiness
- Event schema includes `source: web | pwa | android | ios`.
- Client-created timestamps are preserved.
- Sync endpoint is stateless and token/session friendly.
