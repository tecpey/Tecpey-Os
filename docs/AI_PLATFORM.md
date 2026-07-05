# TecPey AI Platform — معماری هوش مصنوعی

**Date:** 2026-07-05
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization
**Status:** Official — Permanent AI Constitution
**Classification:** Internal — Strategic Architecture Document
**Supersedes:** `docs/MENTOR_AI_MODEL.md` (AI architecture section)

---

## ۱. مقدمه / Introduction

TecPey AI is not a single chatbot. It is an **AI Operating System** — a multi-agent, multi-model, multi-tenant intelligence layer that powers every pillar of the platform.

Every AI capability — from the student-facing Mentor to the internal Executive agents — routes through a unified **AI Gateway** with shared memory, model routing, cost control, governance, and observability.

---

## 2. TecPey AI Ecosystem — Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TECPEY AI GATEWAY                            │
│  Authentication · Rate Limiting · Cost Control · Audit · Logging    │
├─────────────────────────────────────────────────────────────────────┤
│                         MODEL ROUTER                                 │
│  OpenAI ← Anthropic ← Local Models ← Future TecPey Models          │
├─────────────────────────────────────────────────────────────────────┤
│                         AI AGENTS                                   │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │Mentor│ │Trading│ │Admin │ │Exec  │ │Market│ │Customer│          │
│  │  AI  │ │  AI  │ │  AI  │ │  AI  │ │place │ │  AI   │           │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘           │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │White-│ │Internal│ │C-Level│ │Edu   │ │Comply│ │Dev   │          │
│  │Label │ │  AI   │ │  AI  │ │  AI  │ │  AI  │ │  AI  │           │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘           │
├─────────────────────────────────────────────────────────────────────┤
│                     SHARED INFRASTRUCTURE                           │
│  Memory Layer · Prompt Registry · MCP Integration · Vector Store    │
│  Knowledge Base · Behavioral Context · Tenant Config · Feature Flags│
├─────────────────────────────────────────────────────────────────────┤
│                     AI GOVERNANCE                                   │
│  Permissions · Security · Observability · Audit Logs · Analytics    │
│  Rate Limits · Failover · Compliance · Data Retention               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. AI Agent Definitions

### 3.1 TecPey AI (Core Brain)

The central intelligence orchestrator. Routes requests to the correct agent, manages context, enforces governance, and provides fallback responses when specialized agents are unavailable.

| Property | Value |
|----------|-------|
| **Purpose** | Central orchestration, context management, agent routing |
| **Model** | Claude Opus 4.8 (primary), GPT-4o (fallback) |
| **Domain** | Cross-platform |
| **Context** | All available (summary-level) |
| **Launch Phase** | Phase 49 (AI OS V1) |
| **Status** | 🚧 Planned |

### 3.2 Mentor AI

The student-facing educational AI coach. Uses Socratic method with full behavioral context (Trading DNA, quiz history, trading journal, conversation history).

| Property | Value |
|----------|-------|
| **Purpose** | Personalized educational coaching |
| **Current Model** | GPT-4o-mini (OpenAI) |
| **Fallback Model** | GPT-4.1-mini |
| **Max Output Tokens** | 700 |
| **Temperature** | 0.2 |
| **Context** | Trading DNA, quiz history, conversation history, behavioral profile |
| **Current Status** | ✅ Production (Phase 16) |
| **Target Enhancement** | Phase 49 (unified AI OS) |

Key capabilities:
- Socratic questioning — guides student to discover answers
- Behavioral coaching — uses Trading DNA to personalize guidance
- Memory persistence — remembers past conversations (TTL-based)
- Event-driven profile updates — learns from quizzes, trades, interactions
- Cost guard — budget-aware model selection

### 3.3 Trading AI

Real-time market analysis, trade decision support, risk assessment, and strategy backtesting assistant.

| Property | Value |
|----------|-------|
| **Purpose** | Market analysis, trade support, risk assessment |
| **Model** | Claude Haiku 4.5 (primary), GPT-4.1-mini (fallback) |
| **Domain** | Markets, trading, analysis |
| **Context** | Market data, portfolio, risk profile |
| **Launch Phase** | Phase 49 |
| **Status** | 🚧 Planned |

### 3.4 Admin AI

Internal operations assistant for platform administrators — user management, compliance review, anomaly detection, system health analysis.

| Property | Value |
|----------|-------|
| **Purpose** | Admin operations, compliance, anomaly detection |
| **Model** | Claude Opus 4.8 |
| **Domain** | Administration, compliance, operations |
| **Context** | Platform metrics, user data (anonymized), compliance queues |
| **Launch Phase** | Phase 49 |
| **Status** | 🚧 Planned |

### 3.5 Executive AI

C-level strategic decision support — analyzes platform KPIs, growth metrics, cohort trends, and generates executive summaries.

| Property | Value |
|----------|-------|
| **Purpose** | Strategic analysis, executive reporting |
| **Model** | Claude Opus 4.8 |
| **Domain** | Business intelligence, strategy |
| **Context** | Aggregated analytics, financial reports, growth metrics |
| **Launch Phase** | Phase 49 |
| **Status** | 🚧 Planned |

### 3.6 C-Level AI Agents

Specialized agents for each executive function:

| Agent | Purpose | Model | Phase |
|-------|---------|-------|-------|
| **CTO AI** | Architecture review, code quality, security analysis | Claude Opus 4.8 | 49 |
| **CPO AI** | Product strategy, feature prioritization, user research | Claude Sonnet 5 | 49 |
| **CMO AI** | Marketing analysis, SEO recommendations, content strategy | Claude Sonnet 5 | 49 |
| **CFO AI** | Financial analysis, revenue forecasting, cost optimization | Claude Opus 4.8 | 49 |
| **CRO AI** | Risk assessment, compliance monitoring, regulatory reporting | Claude Opus 4.8 | 49 |

### 3.7 Marketplace AI

Powers the TecPey Marketplace — listing recommendations, quality scoring, fraud detection, ranking optimization.

| Property | Value |
|----------|-------|
| **Purpose** | Marketplace intelligence, recommendations, moderation |
| **Model** | Claude Haiku 4.5 (primary), GPT-4.1-mini (fallback) |
| **Domain** | Marketplace |
| **Launch Phase** | Phase 48 |
| **Status** | 🚧 Planned |

### 3.8 White-Label AI

Per-tenant AI customization — each white-label tenant can configure their own AI model, branding, and behavior.

| Property | Value |
|----------|-------|
| **Purpose** | Per-tenant AI customization, brand-consistent responses |
| **Model** | Tenant-configurable |
| **Domain** | Multi-tenant |
| **Launch Phase** | Phase 44 (tenant infra) + Phase 49 |
| **Status** | 🚧 Planned |

### 3.9 Customer AI

Customer support and success — ticket triage, automated responses, sentiment analysis, escalation routing.

| Property | Value |
|----------|-------|
| **Purpose** | Customer support automation, ticket triage |
| **Model** | Claude Haiku 4.5 (primary), GPT-4.1-mini (fallback) |
| **Domain** | Support |
| **Context** | User history, platform data, knowledge base |
| **Launch Phase** | Phase 49 |
| **Status** | 🚧 Planned |

### 3.10 Internal AI

Team productivity agents — code review assistant, documentation generator, test writer, deployment analyzer.

| Property | Value |
|----------|-------|
| **Purpose** | Engineering productivity, code review, docs generation |
| **Model** | Claude Opus 4.8 |
| **Domain** | Internal engineering |
| **Launch Phase** | Phase 45+ |
| **Status** | 🚧 Planned |

---

## 4. AI Gateway

The unified entry point for all AI requests. Every AI interaction — regardless of agent, tenant, or model — passes through this gateway.

### 4.1 Gateway Responsibilities

| Function | Description |
|----------|-------------|
| **Authentication** | Verify caller identity and permissions |
| **Rate Limiting** | Per-user, per-tenant, per-agent, per-model rate enforcement |
| **Cost Control** | Budget tracking, spend limits, model downgrade triggers |
| **Request Routing** | Route to correct agent and model |
| **Context Assembly** | Gather relevant context (behavioral, platform, tenant) |
| **Audit Logging** | Record every AI interaction |
| **Failover** | Model degradation → fallback → static response |

### 4.2 Gateway API (Target)

```typescript
POST /api/v1/ai/ask
{
  "agent": "mentor" | "trading" | "admin" | "executive" | "customer" | "marketplace",
  "messages": Message[],
  "context": { /* domain-specific context */ },
  "tenantId": string,
  "userId": string,
  "options": {
    "model"?: string,           // override
    "temperature"?: number,     // override
    "maxTokens"?: number,       // override
    "stream"?: boolean,         // enable streaming
    "promptVersion"?: string    // specific prompt version
  }
}
```

---

## 5. Model Router

### 5.1 Model Selection Priority

```
1. Tenant override (tenant.config.aiModel)
2. Agent default (per-agent model mapping)
3. Platform default (AI_DEFAULT_MODEL env var)
4. Fallback chain (defined per agent)
5. Static educational fallback (when all models unavailable)
```

### 5.2 Model-to-Agent Mapping (Target)

| Agent | Primary Model | Fallback 1 | Fallback 2 | Static Fallback |
|-------|--------------|------------|------------|-----------------|
| Mentor AI | GPT-4o-mini | GPT-4.1-mini | — | Educational FAQ |
| Trading AI | Claude Haiku 4.5 | GPT-4.1-mini | — | Risk disclaimer |
| Admin AI | Claude Opus 4.8 | GPT-4o | — | Error message |
| Executive AI | Claude Opus 4.8 | GPT-4o | — | Error message |
| C-Level AI | Claude Opus/Sonnet | GPT-4o | — | Error message |
| Marketplace AI | Claude Haiku 4.5 | GPT-4.1-mini | — | Static results |
| White-Label AI | Tenant-configurable | Platform default | — | Branded fallback |
| Customer AI | Claude Haiku 4.5 | GPT-4.1-mini | GPT-4o-mini | Knowledge base |
| Internal AI | Claude Opus 4.8 | GPT-4o | — | Error message |

### 5.3 Supported Model Providers

| Provider | Status | Models | Use Case |
|----------|--------|--------|----------|
| **OpenAI** | ✅ Current | GPT-4o, GPT-4o-mini, GPT-4.1-mini, GPT-5.4-mini | Mentor AI, cost-sensitive workloads |
| **Anthropic** | 🔧 Integration planned | Claude Opus 4.8, Claude Sonnet 5, Claude Haiku 4.5 | High-stakes AI, reasoning tasks |
| **Local Models** | 🚧 Planned | Llama, Mistral, custom fine-tunes | Offline, privacy-sensitive tenants |
| **TecPey Models** | 🚧 Future | Custom fine-tuned models | Domain-specific (Phase 50+) |

---

## 6. Memory Architecture

### 6.1 Memory Layers

| Layer | Storage | TTL | Scope | Current Status |
|-------|---------|-----|-------|---------------|
| **Conversation Memory** | PostgreSQL (`mentor_conversations`) | Per-session | Per user | ✅ Production |
| **Profile Memory** | PostgreSQL (`mentor_profiles`) | Indefinite | Per user | ✅ Production |
| **Key-Value Memory** | PostgreSQL (`mentor_memories`) | Configurable TTL | Per user | ✅ Production |
| **Behavioral Context** | localStorage → PostgreSQL (Phase 43 target) | Indefinite | Per user | ⚠️ localStorage |
| **Vector Memory** | Vector DB (planned) | Indefinite | Cross-user | 🚧 Planned |
| **Tenant Knowledge** | PostgreSQL + Vector DB | Indefinite | Per tenant | 🚧 Planned |

### 6.2 Context Assembly (Target)

```
User Request
    ↓
Gateway resolves: tenantId, userId, agent
    ↓
Context Assembler gathers:
    ├── User profile (Trading DNA, behavioral snapshot)
    ├── Conversation history (recent N messages)
    ├── Platform context (progress, achievements, streak)
    ├── Tenant config (branding, model override, feature flags)
    └── Knowledge base (curriculum, FAQs, policies)
    ↓
Context window constructed within token budget
    ↓
Sent to Model Router → AI Provider → Response
    ↓
Response logged to audit + conversation memory updated
```

---

## 7. Prompt Registry

### 7.1 Architecture (Target)

```
src/prompts/
├── mentor/
│   ├── v1.0.txt        # Original mentor prompt
│   ├── v1.1.txt        # Current — behavioral context added
│   └── v2.0.txt        # Draft — full DNA integration
├── trading/
│   └── v1.0.txt        # Trading AI prompt
├── admin/
│   └── v1.0.txt        # Admin AI prompt
├── executive/
│   └── v1.0.txt        # Executive AI prompt
├── customer/
│   └── v1.0.txt        # Customer support AI prompt
├── white-label/
│   └── base-v1.0.txt   # Base prompt (tenants override sections)
├── marketplace/
│   └── v1.0.txt        # Marketplace AI prompt
├── internal/
│   └── v1.0.txt        # Internal tools AI prompt
└── registry.ts         # Maps domain + version → file
```

### 7.2 Prompt Management

| Feature | Description | Phase |
|---------|-------------|-------|
| Version tracking | Each prompt has a version ID recorded in AI audit logs | 49 |
| A/B testing | Serve prompt version A to 50% of users, version B to 50% | 49 |
| Tenant overrides | White-label tenants can customize prompt sections | 49 |
| Prompt performance | Track response quality by prompt version | 49 |
| Rollback | Revert to previous prompt version instantly | 49 |

---

## 8. MCP Integration (Model Context Protocol)

TecPey AI agents can access external tools and data sources via MCP:

| Integration | Purpose | Agent | Phase |
|-------------|---------|-------|-------|
| **Market Data** | Real-time price feeds, order book | Trading AI | 49 |
| **Academy Content** | Curriculum, lessons, quizzes | Mentor AI | 49 |
| **Student Progress** | Quiz results, completion data | Mentor AI | 49 |
| **Trading Arena** | Simulator results, journal entries | Mentor AI + Trading AI | 49 |
| **Certificate Registry** | Verify certificates | Admin AI | 49 |
| **Compliance Database** | KYC/AML status | Admin AI | 49 |
| **Customer Tickets** | Support history | Customer AI | 49 |
| **Platform Metrics** | System health, usage analytics | Executive AI | 49 |
| **Wallet/Transactions** | Withdrawal status, balance (read-only) | Admin AI | 49 |

---

## 9. Cost Control

### 9.1 Cost Architecture

| Layer | Mechanism | Status |
|-------|-----------|--------|
| **Model Tiering** | Cheaper models for high-volume, expensive models for critical tasks | ⚠️ Partial |
| **Token Budget** | Per-request max tokens enforced before API call | ✅ Mentor only |
| **Spend Limits** | Monthly cap per tenant, per agent | 🚧 Planned |
| **Usage Alerts** | Notify when spend exceeds threshold | 🚧 Planned |
| **Model Downgrade** | Auto-downgrade when budget exceeded | 🚧 Planned |
| **Caching** | Cache common responses (FAQ, static knowledge) | 🚧 Planned |
| **Batching** | Batch non-urgent requests for lower cost | 🚧 Planned |

### 9.2 Cost Tiers (Target)

| Tier | Monthly Budget | Models | Tenants |
|------|---------------|--------|---------|
| **Free** | $0.50/user | GPT-4o-mini, Claude Haiku | Individual students |
| **Pro** | $5/user | GPT-4o, Claude Sonnet | Serious learners |
| **Enterprise** | Custom | All models including Opus | Institutions |
| **White-Label** | BYO API key | Tenant-configured | White-label customers |

---

## 10. AI Governance

### 10.1 AI Permissions

| Permission | Description | Default |
|------------|-------------|---------|
| `ai:mentor:ask` | Ask Mentor AI questions | All authenticated users |
| `ai:mentor:history` | View own conversation history | Self only |
| `ai:trading:ask` | Ask Trading AI questions | Pro+ users |
| `ai:admin:ask` | Access Admin AI | Admin role |
| `ai:executive:read` | Read executive summaries | C-Level role |
| `ai:marketplace:manage` | Manage marketplace AI | Marketplace admin |
| `ai:tenant:configure` | Configure tenant AI settings | Tenant admin |
| `ai:models:view` | View available models | All authenticated users |
| `ai:models:override` | Override model selection | Tenant admin |

### 10.2 AI Security

| Control | Description | Priority |
|---------|-------------|----------|
| **Input Sanitization** | Strip PII from AI context before API call | P1 |
| **Output Validation** | Block harmful or non-compliant responses | P1 |
| **Prompt Injection Protection** | Validate user input for injection attempts | P1 |
| **Rate Limiting** | Per-user, per-tenant, per-agent | P0 |
| **Data Isolation** | Tenant A's data never reaches Tenant B's context | P0 |
| **Consent Enforcement** | Student data used in AI only with consent | P1 |
| **Model Access Control** | Sensitive models restricted by role | P1 |

### 10.3 AI Observability

| Metric | Collection | Retention |
|--------|------------|-----------|
| Request count | Real-time | 90 days |
| Latency (p50/p95/p99) | Real-time | 90 days |
| Token usage (prompt + completion) | Per-request | 90 days |
| Cost per user/tenant/agent | Aggregated | 12 months |
| Error rate | Real-time | 90 days |
| Fallback activation count | Real-time | 90 days |
| Model distribution | Aggregated | 12 months |
| User satisfaction (thumbs up/down) | Per-response | Indefinite |

### 10.4 AI Audit Logs

Every AI interaction is logged:

```typescript
type AIAuditEvent = {
  id: UUID;
  timestamp: Date;
  tenantId: string;
  userId: string;
  agent: AIAgent;
  model: string;
  promptVersion: string | null;
  tokenCount: { prompt: number; completion: number };
  cost: number;
  latency: number;
  responseCode: "success" | "error" | "fallback" | "blocked";
  errorType: string | null;
  userSatisfaction: boolean | null;
};
```

### 10.5 AI Rate Limits (Target)

| Agent | Free | Pro | Enterprise | White-Label |
|-------|------|-----|------------|-------------|
| Mentor AI | 50/day | 200/day | 1000/day | Tenant-configurable |
| Trading AI | 10/day | 50/day | 500/day | Tenant-configurable |
| Admin AI | — | — | 200/day | Tenant-configurable |
| Customer AI | — | — | Unlimited | Tenant-configurable |
| Marketplace AI | — | — | 500/day | Tenant-configurable |

---

## 11. AI Failover Strategy

```
Primary Model Available?
    ├── YES → Serve request
    └── NO  → Try Fallback 1
                ├── YES → Serve request (logged as fallback)
                └── NO  → Try Fallback 2
                            ├── YES → Serve request (logged as degraded)
                            └── NO  → Serve Static Fallback
                                        └── Log critical alert
```

### Fallback Responses by Agent

| Agent | Static Fallback |
|-------|----------------|
| Mentor AI | Educational FAQ from curated knowledge base |
| Trading AI | "Trading analysis is temporarily unavailable. Remember: all trading involves risk." |
| Admin AI | "Admin AI is unavailable. Critical operations continue in manual mode." |
| Customer AI | "Support is temporarily unavailable. Your ticket has been queued." |

---

## 12. AI Analytics

| Report | Description | Audience |
|--------|-------------|----------|
| Usage Dashboard | Request volume, active users, popular agents | Admin |
| Cost Report | Spend by tenant, agent, model | Executive |
| Quality Metrics | User satisfaction, fallback rate, error rate | AI Team |
| Performance Report | Latency trends, model comparison | Engineering |
| Capacity Planning | Growth trends, projected costs | C-Level |

---

## 13. AI Development Roadmap

| Phase | AI Milestone | Delivery |
|-------|-------------|----------|
| 16 | ✅ Mentor AI V1 (OpenAI, basic memory) | Done |
| 25 | 🚧 Mentor AI V2 (behavioral context, event-driven) | Planned |
| 49 | 🚧 AI OS V1 (Gateway, Model Router, all agents) | Future |
| 50 | 🚧 AI OS V2 (MCP, vector memory, streaming, A/B testing) | Future |
| 50+ | 🚧 Custom TecPey fine-tuned models | Future |

---

## 14. Current AI Implementation Status

| Component | Status | Location |
|-----------|--------|----------|
| Mentor AI (OpenAI) | ✅ Production | `src/app/api/ai-mentor/` |
| Mentor Memory Engine | ✅ Production | `src/lib/mentor-memory.ts` |
| Mentor Profiles | ✅ Production | `src/lib/mentor-profiles.ts` |
| Mentor Signals | ✅ Production | `src/lib/mentor-signals.ts` |
| Event-Driven Updates | ✅ Production | `src/lib/mentor-events.ts` |
| Cost Guard | ✅ Production | AI Mentor request validation |
| AI Gateway | 🚧 Planned | — |
| Model Router | 🚧 Planned | — |
| Prompt Registry | 🚧 Planned | — |
| Trading AI | 🚧 Planned | — |
| Admin AI | 🚧 Planned | — |
| Executive AI | 🚧 Planned | — |
| MCP Integration | 🚧 Planned | — |

---

## 15. AI Governance Principles (Permanent)

1. **AI serves the student, not the platform.** Behavioral data belongs to the student. AI uses it to help, not to manipulate.
2. **No financial advice.** AI Mentor provides education, not recommendations. Trading AI provides analysis, not signals.
3. **Transparency.** Users must know when they are interacting with AI versus a human.
4. **Human oversight.** Critical decisions (withdrawals, compliance, account actions) always require human review.
5. **Privacy by design.** AI context is assembled with minimum necessary data. No permanent storage of raw AI interactions beyond user-authorized retention.
6. **Fail safe.** When AI is unavailable, the platform degrades gracefully. No critical path depends on AI availability.
7. **Tenant isolation.** White-label tenants' AI data is fully isolated. One tenant cannot influence another's AI behavior.

---

*این سند، قانون اساسی هوش مصنوعی تک‌پی است. تمام قابلیت‌های هوش مصنوعی باید با این اصول معماری سازگار باشد.*
*This document is the TecPey AI Constitution. All AI capabilities must be consistent with this architecture.*
