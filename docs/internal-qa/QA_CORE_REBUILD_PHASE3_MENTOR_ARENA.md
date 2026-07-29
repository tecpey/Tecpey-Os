# TecPey Core Rebuild — Phase 3 QA

## Scope
Phase 3 adds the first production-grade foundation for:

- Mentor Memory Engine
- Trading Arena Foundation
- Server-backed trading journal
- Mentor supervision snapshot
- Academy-profile-locked arena access

## Implemented

### 1. Trading Arena API
Added `src/app/api/trading-arena/route.ts`.

Endpoints:

- `GET /api/trading-arena`
- `POST /api/trading-arena`

The API requires a valid academy student session. It does not accept anonymous trading decisions.

### 2. Trading Arena Storage
Supports PostgreSQL when `DATABASE_URL` is configured. Falls back to local storage only in local/development mode.

Stored fields:

- symbol
- side
- order type
- demo size
- risk percentage
- entry reason
- emotion
- risk and exit plan
- mentor note
- discipline score
- risk flag

### 3. Mentor Memory API
Added `src/app/api/academy/mentor-memory/route.ts`.

This builds a summary from:

- academy term progress
- trading arena journal
- risk flags
- discipline scores
- emotion signals

### 4. Trading Arena Client
Updated `TradingArenaProClient` to load and save trades through the new server API instead of relying only on `localStorage`.

`localStorage` remains only as a browser fallback for development/offline testing.

### 5. Mentor Coach Center
Updated mentor coach center to read the official mentor memory endpoint.

## RedTeam Notes

- Arena remains locked until academy profile exists.
- Trading decisions are not real orders.
- Risk > 3% is flagged.
- Revenge/FOMO/no-stop-plan language is flagged.
- Mentor memory uses server data when available.

## Test checklist

1. Create academy account.
2. Create academy profile.
3. Open `/academy/simulator`.
4. Submit a demo trade with reason and risk plan.
5. Refresh page and verify the journal persists.
6. Open `/academy/mentor-coach` and verify mentor memory changes.
7. Try `/academy/simulator` without academy profile and verify it is locked.

