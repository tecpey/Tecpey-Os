# Withdrawal Security Gate — TecPey Phase 36

Multi-layer security checks applied before every withdrawal is processed.

## Gate Layers (in order)

```
Withdrawal Request
      │
      ▼
[1] Risk Level Check          ← enforceWithdrawAllowed(userId) from risk-enforcement.ts
      │ withdraw_blocked | all_blocked → 403
      ▼
[2] Velocity Limit Check      ← checkWithdrawVelocity(userId, amountUsd)
      │ > $10,000 / 24h → 429
      ▼
[3] 2FA Re-verification       ← requires2faForWithdrawal(amountUsd) → true if >= $100
      │ no verified 2FA token → 403 (requires_2fa)
      ▼
[4] Device Trust Check        ← isDeviceTrusted(userId, fingerprint)
      │ untrusted device + large withdrawal → additional friction
      ▼
      ALLOW
```

## API

```typescript
import { runWithdrawGate } from "@/lib/security/withdraw-gate";

const result = await runWithdrawGate({
  userId: "...",
  amountUsd: 500,
  deviceFingerprint: "sha256-hex...",
  totpVerified: true,  // set if user just completed TOTP re-prompt
});

if (!result.allowed) {
  return apiError(result.reason, 403);
}
```

## Velocity Limits

| Limit | Default | Override |
|-------|---------|----------|
| Per-user rolling 24h | $10,000 USD | Pass `limitUsd` to `checkWithdrawVelocity()` |

Redis key: `tecpey:withdraw:velocity:{userId}` (INCRBYFLOAT, TTL 86400s)

## 2FA Threshold

Withdrawals ≥ $100 USD require TOTP re-verification regardless of session age.

Endpoints that call the gate should:
1. Call `requires2faForWithdrawal(amount)` → if true, challenge with `POST /api/auth/2fa/verify`
2. Pass `totpVerified: true` once the verify endpoint confirms

## Risk Level Integration

The risk engine (Phase 35) can block withdrawals via `withdraw_blocked` or `all_blocked` risk levels set via `setRiskLevel(userId, "withdraw_blocked", ttl)`.

See [RISK_ENGINE.md](./RISK_ENGINE.md) for full risk level documentation.

## Device Trust

A device is "trusted" if its fingerprint appears in `known_devices` for the user. Fingerprint = `SHA-256(userAgent + "\x00" + ip)`.

New devices trigger `new_device_detected` metric and audit event. For large withdrawals from untrusted devices, consider requiring additional email confirmation (Phase 38 scope).
