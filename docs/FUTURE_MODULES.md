# TecPey — Future Modules Architecture

**Phase 19 | Module Reservations**
**Date:** 2026-06-28
**Status:** Architecture placeholders — no implementation

This document reserves the architecture for future modules. Each module has a defined data model, API surface, and integration points. None of these modules are implemented in Phases 0–19.

---

## Module Group 1 — Financial Ecosystem

### FM-1: Savings Plans

**Description:** Goal-based savings with scheduled contributions. Educational overlay explains the mechanics. No actual bank account integration in Phase 1.

**Data Model:**
```typescript
SavingsPlan {
  id: UUID
  tenantId: UUID
  userId: UUID
  name: string                          // "Emergency Fund", "BTC Goal"
  goalAmount: Decimal
  goalCurrency: string                  // "USDT", "USD"
  startDate: Date
  targetDate: Date | null               // null = open-ended
  contributionSchedule: ContributionSchedule
  currentAmount: Decimal
  status: "active" | "paused" | "completed" | "cancelled"
  educationalMode: boolean              // if true = simulation only, no real funds
  complianceFlags: ComplianceFlag[]     // jurisdiction restrictions
}

ContributionSchedule {
  frequency: "daily" | "weekly" | "monthly" | "manual"
  amount: Decimal
  currency: string
}
```

**API Surface:**
```
POST /api/v1/financial/savings          Create a savings plan
GET  /api/v1/financial/savings          List my plans
GET  /api/v1/financial/savings/{id}     Get plan details
PATCH /api/v1/financial/savings/{id}    Update plan
DELETE /api/v1/financial/savings/{id}   Cancel plan
POST /api/v1/financial/savings/{id}/contribute  Add contribution
```

**Integration Points:**
- Academy: lesson completions can trigger educational savings milestones
- Behavioral Engine: savings consistency adds to the Consistency dimension
- Exchange Wallet: in non-educational mode, links to exchange balance

**Compliance:** Deposit-taking regulation applies in most jurisdictions. Phase 1 implementation must be educational-mode only. Real money flow requires regulatory review per market.

---

### FM-2: Investment Clubs (Rotating Savings Groups)

**Description:** Groups of students pool educational capital for collaborative learning. In educational mode, uses paper capital. In real mode, requires financial service license.

**Data Model:**
```typescript
InvestmentClub {
  id: UUID
  tenantId: UUID
  name: string
  members: ClubMembership[]
  goalType: "fixed-pool" | "rotating-savings"
  poolAmount: Decimal               // for fixed-pool type
  rotationSchedule: string | null   // for rotating-savings
  educationalMode: boolean
  minimumBehavioralScore: number    // minimum Trading DNA to join
  status: "forming" | "active" | "completed" | "dissolved"
}

ClubMembership {
  userId: UUID
  clubId: UUID
  role: "organizer" | "member"
  contributionAmount: Decimal
  joinedAt: Date
  tradingDNAAtJoin: DNASnapshot     // snapshot at join time for accountability
}
```

**API Surface:**
```
POST /api/v1/financial/clubs          Create club
GET  /api/v1/financial/clubs          List available clubs
POST /api/v1/financial/clubs/{id}/join  Request to join
```

**Compliance:** Investment club regulation varies. Educational mode (paper capital) is safe. Real money pooling requires fund management or cooperative license.

---

### FM-3: Educational Capital Pools

**Description:** Shared paper capital pools for collaborative Trading Arena scenarios. Multiple students share a simulated portfolio and make collective decisions. No real money.

**Data Model:**
```typescript
EducationalPool {
  id: UUID
  tenantId: UUID
  name: string
  createdBy: UUID
  participants: UUID[]
  paperCapital: Decimal             // always paper, never real
  scenarioId: string | null         // optionally tied to a Trading Arena scenario
  decisions: PoolDecision[]
  status: "open" | "active" | "completed"
}

PoolDecision {
  proposerId: UUID
  asset: string
  action: "buy" | "sell" | "hold"
  rationale: string
  votes: Vote[]
  outcome: "approved" | "rejected" | "pending"
  executedAt: Date | null
}
```

**Integration Points:**
- Trading Arena: pool uses the same price feed and simulator mechanics
- Community: pool participants can view each other's reasoning (opt-in)
- Behavioral Engine: collective decision quality feeds the Decision Quality dimension

---

### FM-4: Wallet Abstraction Layer

**Description:** Unified interface for all balance types (educational paper wallet, exchange wallet, savings wallet). Enables unified portfolio view.

**Interface:**
```typescript
interface AbstractWallet {
  id: string
  tenantId: string
  userId: string
  type: "educational" | "exchange" | "savings" | "escrow" | "club"
  balances: Record<string, Decimal>   // currency → amount
  
  getTransactions(options: PaginationOptions): Promise<Transaction[]>
  canDebit(amount: Decimal, currency: string): Promise<boolean>
  debit(amount: Decimal, currency: string, reference: string): Promise<Transaction>
  credit(amount: Decimal, currency: string, reference: string): Promise<Transaction>
}
```

**Implementations:**
- `EducationalWallet` — wraps Trading Arena state (no real funds)
- `ExchangeWallet` — calls `my.tecpey.ir` API (real funds, OAuth-scoped)
- `SavingsWallet` — wraps SavingsPlan model
- `EscrowWallet` — locked funds with release conditions

---

### FM-5: Escrow Service

**Description:** Locked funds with condition-based release. Supports future use cases: milestone-based payments, peer transactions, educational performance rewards.

**Data Model:**
```typescript
EscrowContract {
  id: UUID
  tenantId: UUID
  depositorId: UUID
  beneficiaryId: UUID
  amount: Decimal
  currency: string
  releaseCondition: EscrowCondition
  status: "funded" | "released" | "refunded" | "disputed"
  fundsAt: Date
  releasedAt: Date | null
}

EscrowCondition =
  | { type: "manual"; approverRole: string }
  | { type: "date"; releaseDate: Date }
  | { type: "milestone"; milestoneId: string; completedBy: Date }
  | { type: "oracle"; oracleUrl: string; condition: string }
```

**Compliance:** Escrow provider license required in most jurisdictions. Phase 1: educational escrow simulation only.

---

## Module Group 2 — AI Operating System

### AI-1: Support AI

**Description:** Customer support AI that handles common questions, escalates to humans when needed. Context-aware from student profile and recent sessions.

**Data Model:**
```typescript
SupportSession {
  id: UUID
  tenantId: UUID
  userId: UUID
  messages: SupportMessage[]
  status: "open" | "resolved" | "escalated"
  escalatedTo: UUID | null           // human support agent
  aiModel: string
  promptVersion: string
}
```

**Prompt Context:** Student's current term, recent errors, account status. Does NOT include behavioral DNA unless student explicitly shares.

---

### AI-2: Admin AI

**Description:** Internal AI for tenant admins and TecPey operators. Analyzes aggregate data, drafts communications, explains metrics.

**Scope:** Tenant-admin role only. Cannot access individual student data directly — must request aggregate queries. All requests logged.

---

### AI-3: Trading Coach AI (Phase 38+)

**Description:** Real-time behavioral coaching during live trading sessions. Requires explicit user consent and exchange API scope.

**Architecture:**
```
User consents → Exchange API OAuth scope granted → TradingCoachAI subscribes to trade events
Trade event → AI evaluates behavioral flags → Optional real-time nudge (notification)
```

**Constraints:**
- NEVER provides buy/sell signals
- NEVER predicts price direction
- ONLY provides behavioral coaching ("you've made 3 trades in 5 minutes — revenge trade risk")
- User can disable at any time

---

### AI-4: Knowledge AI

**Description:** Answers knowledge questions from the TecPey curriculum. Can explain any concept from any term. Cites the specific lesson it is drawing from.

**Distinct from Mentor AI:** Knowledge AI answers "What is stop loss?" Mentor AI asks "Why did you not use stop loss on your last 3 trades?"

---

## Module Group 3 — Developer Platform

### DEV-1: OAuth 2.0 Server

**Data Model:**
```typescript
OAuthClient {
  id: UUID
  tenantId: UUID
  name: string
  secret: string  // hashed
  redirectUris: string[]
  scopes: OAuthScope[]
  createdAt: Date
}

OAuthToken {
  id: UUID
  clientId: UUID
  userId: UUID
  scopes: OAuthScope[]
  accessToken: string   // hashed
  refreshToken: string  // hashed
  expiresAt: Date
  refreshExpiresAt: Date
}

OAuthScope = 
  "read:progress" | "read:dna" | "read:certificates" |
  "write:journal" | "write:progress" | "webhook:receive"
```

---

### DEV-2: Webhook System

**Data Model:**
```typescript
WebhookRegistration {
  id: UUID
  clientId: UUID
  tenantId: UUID
  url: string
  secret: string        // for HMAC-SHA256 signature
  events: WebhookEvent[]
  status: "active" | "paused" | "failed"
  lastDeliveryAt: Date | null
}

WebhookDelivery {
  id: UUID
  registrationId: UUID
  event: WebhookEvent
  payload: object
  status: "pending" | "delivered" | "failed"
  attempts: number
  nextRetryAt: Date | null
  response: { statusCode: number; body: string } | null
}
```

**Retry policy:** 3 attempts. Delays: 5s, 60s, 600s (exponential backoff). After 3 failures, registration is paused.

**Signature:** `X-TecPey-Signature: sha256=<HMAC-SHA256(secret, body)>`

---

### DEV-3: Plugin Marketplace

**Description:** Third-party developers can build plugins that extend TecPey's capabilities.

**Plugin Types:**
```typescript
PluginType = 
  | "lesson-format"       // new content type (video, interactive sim, etc.)
  | "behavioral-scorer"   // new behavioral dimension
  | "challenge-type"      // new community challenge format
  | "financial-product"   // new Financial Ecosystem product
  | "integration"         // connection to external service
```

**Plugin Manifest:**
```json
{
  "id": "org.example.myplugin",
  "version": "1.0.0",
  "type": "behavioral-scorer",
  "name": "Social Learning Score",
  "permissions": ["read:progress", "read:community"],
  "sandboxed": true,
  "reviewStatus": "approved"
}
```

All plugins are reviewed before marketplace listing. Sandboxed execution (no DB access except via sanctioned API calls).

---

## Module Group 4 — Social & Reputation Extension

### SOC-1: Creator Economy Foundation

**Description:** High-reputation students can create educational content (lessons, guides, challenges) and receive recognition (not payment in Phase 1).

**Reputation gating:** Minimum Trading DNA overall score 70, minimum Term 3 certificate, minimum 6-month tenure.

**Content Types:**
- Study guides (markdown + quiz)
- Practice challenges (behavioral targets)
- Scenario variations (Trading Arena scenario templates)

**Moderation:** All creator content reviewed before publishing. Community report system.

---

### SOC-2: Mentor Network

**Description:** Certified graduates can become peer mentors. Peer mentors hold structured office hours (scheduled, not DM) and receive recognition.

**Requirements to become a peer mentor:**
- Term 7 certificate
- Trading DNA overall ≥ 80
- 12+ months tenure
- Instructor approval

**Mentor Tools:**
- Scheduled availability calendar
- Student queue (opt-in from students)
- Session notes (private, student-visible)
- Feedback loop (student rates session quality)

---

### SOC-3: Trust Score System

**Description:** A composite trust score that summarizes a student's verifiable contributions to the platform.

**Components:**
```typescript
TrustScore {
  overall: number                    // 0-1000
  components: {
    academicCredibility: number      // certificates, graduation rate
    behavioralConsistency: number    // DNA dimensions
    communityContribution: number    // journals shared, challenges, mentor sessions
    tenure: number                   // platform age
    verificationLevel: number        // identity verification depth
  }
}
```

**Uses:**
- Prop firm hiring signal (with consent)
- Creator Economy access gate
- Peer Mentor eligibility
- Investment Club minimum threshold

---

## Module Group 5 — Governance & Compliance

### GOV-1: Regulatory Compliance Module

**Per-jurisdiction compliance flags on financial products:**
```typescript
ComplianceProfile {
  jurisdiction: string              // ISO 3166-1 alpha-2
  educationalOnlyRestriction: boolean
  islamicFinanceRequired: boolean
  depositTakingLicenseRequired: boolean
  fundManagementLicenseRequired: boolean
  dataResidencyRequirement: string | null
  approvedModules: string[]         // module IDs allowed in this jurisdiction
  restrictedModules: string[]       // module IDs blocked in this jurisdiction
}
```

**Enforcement:** Middleware checks `request.tenant.complianceProfile.restrictedModules` before routing to any Financial Ecosystem endpoint.

---

### GOV-2: Audit Trail System

```typescript
AuditEvent {
  id: UUID
  tenantId: UUID
  actorId: UUID | "system"
  actorRole: string
  action: string                    // "student.data.exported" etc.
  resourceType: string
  resourceId: string
  before: object | null
  after: object | null
  ipAddress: string
  userAgent: string
  timestamp: Date
  checksum: string                  // SHA-256 of all fields for tamper detection
}
```

Audit log is append-only. No UPDATE or DELETE operations. Export available to tenant admins and regulatory authorities.

---

*Future Modules Architecture v1.0 — Phase 19. No implementation in Phases 0–19.*
