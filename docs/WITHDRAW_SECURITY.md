# Withdrawal Security — TecPey Phase 37

Full withdrawal lifecycle: security enforcement → compliance runtime → admin review → notification.

---

## State Machine

```
                    ┌─────────────┐
                    │   pending   │ ← Created after security gate passes
                    └──────┬──────┘
           compliance checks run asynchronously (5s timeout per provider)
                           │
          ┌────────────────┼──────────────────┐
          ▼                ▼                  ▼
    ┌──────────┐   ┌────────────────┐   ┌─────────┐
    │ approved │   │compliance_review│   │ blocked │
    └──────────┘   └───────┬────────┘   └─────────┘
                           │ admin review
                    ┌──────┴──────┐
                    ▼             ▼
              ┌──────────┐  ┌──────────┐
              │ approved │  │ rejected │
              └──────────┘  └──────────┘
```

Terminal states: `completed` (Phase 38+), `cancelled` (user-initiated).

---

## Enforcement Layers

```
POST /api/auth/withdraw
      │
      ▼
[1] Risk Level Check          ← enforceWithdrawAllowed(userId) — Redis O(1)
      │ withdraw_blocked | all_blocked → 403
      ▼
[2] Full Security Gate        ← runWithdrawGate(userId, amountUsd, fingerprint, 2fa)
      │ velocity | 2FA missing | untrusted device → 403
      ▼
[3] DB Record Created         → state: pending
      │
      ▼ (async, non-blocking)
[4] Compliance Checks         ← getComplianceProviders() — timeout 5s each
      ├─ KYC.getStatus()      → kyc_status
      ├─ AML.screenTransaction() → aml_risk
      └─ Sanctions.screenAddress() → sanctions_hit
      │
      ▼
[5] State Decision
      ├─ sanctions_hit=true OR aml=blocked/high OR kyc=rejected  → blocked
      ├─ aml=medium OR kyc=pending OR kyc=not_started (≥$500)    → compliance_review
      └─ otherwise                                               → approved
```

---

## Security Gate Thresholds

| Check | Threshold | Action |
|-------|-----------|--------|
| Velocity limit | $10,000 USD / 24h rolling | 429 velocity_limit_exceeded |
| 2FA required | ≥ $100 USD | 403 2fa_required |
| Device trust required | ≥ $1,000 USD | 403 untrusted_device |
| Risk level block | any blocked state | 403 account_withdraw_restricted |

---

## Compliance Decision Table

| KYC Status | AML Risk | Sanctions | Decision |
|------------|----------|-----------|----------|
| approved | low | false | approved |
| approved | medium | false | compliance_review |
| approved | high | false | blocked |
| pending | any | false | compliance_review |
| rejected | any | false | blocked |
| not_started | any (≥$500) | false | compliance_review |
| any | blocked | false | blocked |
| any | any | true | blocked |

Providers that time out or are not configured → their check is skipped gracefully (degrade to less restrictive).

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/withdraw` | User | Create withdrawal request |
| GET | `/api/auth/withdraw` | User | List own withdrawals |
| GET | `/api/auth/withdraw/[id]` | User (owner) | Get withdrawal detail |
| DELETE | `/api/auth/withdraw/[id]` | User (owner) | Cancel pending/review withdrawal |
| GET | `/api/admin/withdrawals` | Admin | Review queue (pending + compliance_review) |
| GET | `/api/admin/withdrawals/[id]` | Admin | Full withdrawal view with compliance result |
| POST | `/api/admin/withdrawals/[id]` | Admin | approve / reject / block / flag_review |

---

## Admin Actions

| Action | Body `action` | Resulting State | Notification |
|--------|--------------|-----------------|--------------|
| Approve | `"approve"` | `approved` | notifyWithdrawalApproved |
| Reject | `"reject"` | `rejected` | notifyWithdrawalRejected |
| Block | `"block"` | `blocked` | notifyWithdrawalBlocked |
| Return to review | `"flag_review"` | `compliance_review` | none |

Every admin decision appends an immutable row to `withdrawal_admin_actions`. The withdrawal record's `reviewed_by`, `reviewed_at`, and `review_notes` are updated.

```json
POST /api/admin/withdrawals/{id}
{
  "action": "approve",
  "notes": "KYC verified manually, address confirmed clean"
}
```

---

## Security Notifications

Written to `security_notifications` table (fire-and-forget) on:

| Event | Type |
|-------|------|
| Withdrawal created | `withdrawal_requested` |
| Withdrawal blocked by compliance/system | `withdrawal_blocked` |
| Withdrawal approved by admin | `withdrawal_approved` |
| Withdrawal rejected by admin | `withdrawal_rejected` |
| AML medium risk | `risky_withdrawal` |

---

## Observability Metrics

| Metric Key | Description |
|------------|-------------|
| `withdrawal_requested` | Total withdrawals created |
| `withdrawal_approved` | Auto-approved + admin-approved |
| `withdrawal_rejected` | Admin-rejected |
| `withdrawal_blocked` | System-blocked + admin-blocked |
| `withdrawal_compliance_review` | Flagged for review |
| `withdrawal_risk_blocked` | Blocked at security gate |
| `withdrawal_cancelled` | User-cancelled |
| `compliance_kyc_checked` | KYC provider called |
| `compliance_aml_checked` | AML provider called |
| `compliance_sanctions_checked` | Sanctions provider called |

Available at `GET /api/admin/security-metrics`.

---

## Database Schema

```sql
-- Core withdrawal record
CREATE TABLE withdrawals (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               TEXT NOT NULL,
  asset                 TEXT NOT NULL,
  amount                TEXT NOT NULL,        -- string to preserve precision
  amount_usd            NUMERIC NOT NULL,
  destination_address   TEXT NOT NULL,
  network               TEXT NOT NULL,
  state                 TEXT NOT NULL DEFAULT 'pending',
  security_gate_passed  BOOLEAN NOT NULL DEFAULT FALSE,
  device_fingerprint    TEXT,
  ip                    TEXT NOT NULL DEFAULT '',
  user_agent            TEXT NOT NULL DEFAULT '',
  two_fa_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Compliance
  kyc_status            TEXT,
  aml_risk              TEXT,
  sanctions_hit         BOOLEAN NOT NULL DEFAULT FALSE,
  compliance_result     JSONB NOT NULL DEFAULT '{}',
  compliance_checked_at TIMESTAMPTZ,
  -- Admin review
  reviewed_by           TEXT,
  reviewed_at           TIMESTAMPTZ,
  review_notes          TEXT,
  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  velocity_used         NUMERIC
);

-- Immutable admin action log
CREATE TABLE withdrawal_admin_actions (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id TEXT NOT NULL REFERENCES withdrawals(id),
  admin_id      TEXT NOT NULL,
  action        TEXT NOT NULL,   -- approve | reject | block | flag_review
  notes         TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Security notification log
CREATE TABLE security_notifications (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  delivered   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Environment Variables

No new env vars required. Inherits from Phase 35/36:

| Variable | Purpose |
|----------|---------|
| `SUMSUB_APP_TOKEN` + `SUMSUB_SECRET_KEY` | KYC via Sumsub |
| `CHAINALYSIS_API_KEY` | AML via Chainalysis KYT |
| `REDIS_URL` | Velocity limits + metrics |
| `DATABASE_URL` | Withdrawal records |

---

## Production Gaps (Phase 38 scope)

- Actual on-chain disbursement (hot wallet signing)
- VASP-to-VASP Travel Rule (Notabene)
- Email delivery for security notifications (SMTP adapter)
- Withdrawal address whitelist per user
- Multi-sig approval for large withdrawals
