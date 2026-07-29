# Compliance Architecture — Phase 36

> Provider interfaces for KYC, AML, Sanctions, and Travel Rule. Sumsub, Chainalysis, and OFAC adapters implemented in Phase 36.

---

## Philosophy

Compliance is implemented as a **port/adapter pattern**. The exchange core defines interfaces (`src/lib/security/compliance.ts`). External providers (Sumsub, Jumio, Chainalysis, Elliptic) plug in by implementing these interfaces.

This enables:
- Swapping providers without changing business logic
- Test doubles in integration tests
- Graceful degradation when providers are unavailable
- Multi-jurisdiction compliance (different providers by region)

---

## Interfaces

### KYCProvider

Identity verification for regulatory compliance (FATF Recommendation 10, MiCA Article 45).

```typescript
interface KYCProvider {
  createSession(userId: string, returnUrl: string): Promise<{ sessionId: string; redirectUrl: string }>;
  getStatus(userId: string): Promise<KycResult>;
  handleWebhook(payload: unknown, signature: string): Promise<{ userId: string; status: KycStatus } | null>;
}
```

**KYC Levels:**
| Level | Description |
|-------|-------------|
| `basic` | Email + phone verification |
| `standard` | Government ID + liveness check |
| `enhanced` | Standard + source of funds |

**Implemented (Phase 36):** Sumsub (`src/lib/compliance/sumsub.ts`) — HMAC-SHA256 signed requests, graceful degrade if `SUMSUB_APP_TOKEN` + `SUMSUB_SECRET_KEY` not set.

**Planned:** Jumio, Persona

---

### AMLProvider

Transaction monitoring for anti-money laundering (FATF Recommendation 15–16, FinCEN BSA).

```typescript
interface AMLProvider {
  screenTransaction(opts: {
    userId, txId, asset, amount, direction, counterpartyAddress?
  }): Promise<AmlScreeningResult>;
  handleAlert(payload: unknown): Promise<{ userId: string; riskScore: AmlRiskScore } | null>;
}
```

**Risk Scores:** `low` | `medium` | `high` | `blocked`

**Implemented (Phase 36):** Chainalysis KYT v2 (`src/lib/compliance/chainalysis.ts`) — requires `CHAINALYSIS_API_KEY`.

**Planned:** Elliptic Lens

---

### SanctionsProvider

Real-time sanctions list screening (OFAC SDN, UN Consolidated, EU, FATF blacklist).

```typescript
interface SanctionsProvider {
  screenUser(opts: { userId, fullName, nationality?, dateOfBirth?, walletAddress? }): Promise<SanctionsHit>;
  screenAddress(address: string, asset: string): Promise<SanctionsHit>;
}
```

**Implemented (Phase 36):** OFAC public API (`src/lib/compliance/ofac.ts`) — no API key required; 5-second timeout; always registered.

**Planned:** Comply Advantage, NICE Actimize

---

### TravelRuleProvider

FATF Travel Rule compliance for transfers > $3,000 USD (US) / €1,000 EUR (EU, MiCA Article 38).

```typescript
interface TravelRuleProvider {
  submitTransfer(opts: { txId, asset, amount, originatorUserId, destinationAddress, destinationVasp? }): Promise<TravelRuleResult>;
  isRequired(amountUsd: number): boolean;
}
```

**Planned (Phase 38):** Notabene, Sygna Bridge, OpenVASP

---

## Provider Registry

Providers are auto-registered at server startup by `bootstrapComplianceProviders()` in `src/lib/compliance/index.ts`, called from `server.ts`:

```typescript
// server.ts
import { bootstrapComplianceProviders } from "./src/lib/compliance/index";
bootstrapComplianceProviders();  // reads env vars, registers available providers
```

Provider selection logic:
- **KYC**: Sumsub if `SUMSUB_APP_TOKEN` + `SUMSUB_SECRET_KEY` set
- **AML**: Chainalysis if `CHAINALYSIS_API_KEY` set
- **Sanctions**: OFAC (always registered, no key required)
- **Travel Rule**: none in Phase 36 (Notabene Phase 38)

All business logic imports only interfaces from `src/lib/security/compliance.ts`. Adapters are only imported in `src/lib/compliance/index.ts`.

```typescript

Unregistered providers return `undefined` — callers must handle:

```typescript
const kyc = getComplianceProviders().kyc;
if (!kyc) return; // provider not configured
```

---

## Compliance Runtime (Phase 37)

The compliance runtime executes provider checks during withdrawal processing. It is decoupled from the security gate (synchronous) and runs asynchronously after the withdrawal record is created.

### Execution sequence

```
[withdrawal created]
       │
       ▼ (async, non-blocking, 5s timeout per check)
  KYC.getStatus(userId)          → skipped if amount < $100 or no provider
  AML.screenTransaction(...)     → skipped if no provider
  Sanctions.screenAddress(...)   → skipped if no provider
       │
       ▼
  Decision → update withdrawal.state
```

### Timeout & degrade behavior

Each provider call is wrapped in `Promise.race([providerCall, timeout(5s)])`. On timeout or exception:
- KYC → skipped
- AML → assumed "low"
- Sanctions → assumed no match

This prevents a slow/offline compliance provider from blocking the withdrawal flow.

### State decisions

See `src/lib/security/withdrawal-service.ts` → `runComplianceChecks()` for the exact decision table.

---

## KYC Gate Thresholds (Phase 36+ enforcement)

| Action | KYC Required |
|--------|-------------|
| Spot trading ≤ $1,000/day | None |
| Spot trading > $1,000/day | `basic` |
| Withdrawal > $500 | `standard` |
| Withdrawal > $10,000 | `enhanced` |
| Fiat on-ramp | `standard` |

These thresholds are not enforced in Phase 34 — the interfaces exist to enable Phase 36 implementation without architectural changes.

---

## Regulatory Framework Support

| Framework | Support Level |
|-----------|--------------|
| FATF 40 Recommendations | Interface-ready |
| MiCA (EU Crypto Regulation) | Interface-ready |
| FinCEN BSA / USA PATRIOT Act | Interface-ready |
| UK FCA PS21/3 (Travel Rule) | Interface-ready |
| OFAC / SDN Compliance | SanctionsProvider interface |
| GDPR / Right to erasure | Considered in data model (user_id as lookup key) |

---

## Phase Roadmap

| Phase | Work |
|-------|------|
| 34 | Interfaces defined (current) |
| 36 | Sumsub KYC integration, OFAC sanctions screening |
| 37 | Chainalysis AML for deposits/withdrawals |
| 38 | Travel Rule (Notabene) for cross-VASP transfers |
| 39 | Regional compliance variations (EU MiCA, UK FCA) |
