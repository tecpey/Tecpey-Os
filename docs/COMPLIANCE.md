# Compliance Architecture — Phase 34

> Provider interfaces for KYC, AML, Sanctions, and Travel Rule. No providers implemented.

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

**Planned providers:** Sumsub, Jumio, Persona

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

**Planned providers:** Chainalysis KYT, Elliptic Lens

---

### SanctionsProvider

Real-time sanctions list screening (OFAC SDN, UN Consolidated, EU, FATF blacklist).

```typescript
interface SanctionsProvider {
  screenUser(opts: { userId, fullName, nationality?, dateOfBirth?, walletAddress? }): Promise<SanctionsHit>;
  screenAddress(address: string, asset: string): Promise<SanctionsHit>;
}
```

**Planned providers:** Comply Advantage, Chainalysis Sanctions, NICE Actimize

---

### TravelRuleProvider

FATF Travel Rule compliance for transfers > $3,000 USD (US) / €1,000 EUR (EU, MiCA Article 38).

```typescript
interface TravelRuleProvider {
  submitTransfer(opts: { txId, asset, amount, originatorUserId, destinationAddress, destinationVasp? }): Promise<TravelRuleResult>;
  isRequired(amountUsd: number): boolean;
}
```

**Planned providers:** Notabene, Sygna Bridge, OpenVASP

---

## Provider Registry

Providers are registered at server startup (DI container pattern):

```typescript
import { registerComplianceProviders } from "@/lib/security/compliance";

// In server.ts or a bootstrap file:
registerComplianceProviders({
  kyc: new SumsubProvider(process.env.SUMSUB_SECRET_KEY),
  aml: new ChainalysisProvider(process.env.CHAINALYSIS_API_KEY),
  sanctions: new ComplyAdvantageProvider(process.env.COMPLY_API_KEY),
  travelRule: new NotabeneProvider(process.env.NOTABENE_SECRET),
});
```

Unregistered providers return `undefined` — callers must handle:

```typescript
const kyc = getComplianceProviders().kyc;
if (!kyc) return; // provider not configured
```

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
