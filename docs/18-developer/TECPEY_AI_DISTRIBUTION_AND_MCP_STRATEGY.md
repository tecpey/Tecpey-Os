# TecPey AI Distribution & MCP Strategy

**Version:** 1.0  
**Date:** 2026-07-13  
**Status:** Approved strategic direction  
**Primary owner:** Chief Product Officer (CPO)  
**Joint owners:** CAIO, CTO, CGO/CMO, CISO, Compliance/Legal

---

## 1. Strategic Decision

TecPey will treat conversational AI platforms as a first-class product distribution channel, not merely as external marketing surfaces.

The target architectural direction is:

```text
TecPey Core
  -> API Platform
  -> MCP Server
  -> ChatGPT App
  -> Other compatible AI hosts and partner surfaces
```

The first public experience should focus on **TecPey Academy + Mentor AI + educational Trading Arena capabilities**. It must be educational, analytical, simulated, risk-aware, and primarily read-only. Real-money exchange actions must remain inside TecPey's controlled, authenticated, compliant product surfaces unless a future legal, security, and platform-policy review explicitly approves otherwise.

---

## 2. Why This Matters

Conversational AI changes software discovery from link selection to intent fulfillment. A user may express a need such as learning crypto fundamentals, evaluating risk knowledge, reviewing simulated trades, or understanding behavioral mistakes. TecPey should be able to enter that workflow with useful, trusted, contextual capabilities.

This creates five strategic advantages:

1. **Distribution at the moment of intent** rather than after a separate search and onboarding flow.
2. **Education-first acquisition** aligned with TecPey's brand promise.
3. **Reusable platform infrastructure** through APIs, MCP, identity, consent, and policy enforcement.
4. **Compounding Mentor value** through permissioned user context and learning history.
5. **Future ecosystem leverage** across other AI hosts, enterprise assistants, TecPey mobile surfaces, white-label deployments, and later products such as AstroLink.

---

## 3. Product Scope

### 3.1 First approved product surface

**Working name:** TecPey Academy for ChatGPT

Initial capabilities may include:

- Knowledge-level assessment and placement.
- Personalized Academy learning paths.
- Lesson discovery and progress summaries.
- Educational quizzes and explanations.
- Risk-awareness exercises.
- Simulated Trading Arena scenarios.
- Read-only Arena performance summaries.
- Mentor AI explanations of behavioral patterns.
- Trading-journal review using simulated or user-authorized data.
- Certificate and achievement lookup.
- Deep links back to the appropriate TecPey surface.

### 3.2 Explicit exclusions for the first release

- Real-money order placement.
- Deposits, withdrawals, transfers, or wallet signing.
- Custody operations.
- Personalized financial advice.
- Profit promises, trade signals, or guaranteed outcomes.
- Unbounded access to private user history.
- Silent account linking or implicit consent.
- Any action that bypasses TecPey authentication, compliance, or risk controls.

---

## 4. Delivery Sequence

### Stage A — Architect now, without delaying soft launch

- Preserve API-first boundaries in Academy, Mentor, Arena, identity, consent, and profile services.
- Define stable domain contracts for lessons, progress, assessments, simulations, behavioral insights, and achievements.
- Establish an AI Gateway boundary for model/provider access, audit, policy, rate limits, and cost controls.
- Reserve an MCP adapter layer that does not contain core business logic.
- Classify tool operations as public, authenticated read, controlled write, or prohibited.
- Ensure all user context is permissioned and revocable.

### Stage B — Build after core stabilization

Entry conditions:

- Soft-launch P0 security blockers are closed.
- Identity and session behavior are stable.
- Academy and Mentor data required by the app is server-side and durable.
- Audit logging, consent, rate limiting, and observability are available.
- Legal/compliance and platform-policy reviews are complete.

Deliverables:

- Production MCP server.
- Minimal, high-quality ChatGPT app.
- Account-linking and consent flow.
- Read-only Academy/Mentor/Arena tools.
- Safety, privacy, red-team, and failure-mode tests.
- Product analytics that measure learning value rather than trading volume.

### Stage C — Expand only after evidence

Potential later capabilities:

- Interactive Arena simulations.
- Organization and educator experiences.
- White-label AI distribution.
- Additional compatible AI hosts.
- Developer-facing MCP/API documentation.
- Partner integrations with explicit governance.

Expansion requires evidence of user value, security, compliance, maintainability, and no conflict with the education-first mission.

---

## 5. Ownership Model

### CPO — Accountable owner

- Owns user value, product scope, prioritization, roadmap placement, and experience quality.
- Ensures AI distribution is treated as a product channel rather than a technical demo.
- Prevents channel work from disrupting soft-launch priorities.

### CAIO — AI capability owner

- Owns MCP semantics, agent/tool behavior, model governance, context strategy, and evaluation.
- Ensures the integration strengthens the shared TecPey AI platform.

### CTO — Technical delivery owner

- Owns APIs, service boundaries, identity integration, reliability, versioning, and production architecture.
- Keeps business logic inside TecPey services rather than duplicating it in the MCP layer.

### CGO/CMO — Distribution and growth owner

- Owns discoverability, activation, channel measurement, messaging, and conversion into trusted TecPey journeys.
- Must not optimize for low-quality usage or excessive trading activity.

### CISO — Security approver

- Owns threat modeling, token handling, scopes, least privilege, incident controls, auditability, and data-exposure review.

### Compliance/Legal — Policy approver

- Owns financial-services boundaries, disclosures, privacy, platform-policy compatibility, jurisdictional limits, and consent language.

### Interim operating lead

Until a dedicated team is justified, the function is jointly operated by **CPO + CAIO** under the working responsibility **Head of AI Distribution & Ecosystem**. This is not a new C-level role before soft launch.

---

## 6. Architecture Principles

1. **Core logic stays in TecPey.** MCP tools call governed application services; they do not become an alternative backend.
2. **Least privilege by default.** Every tool has the smallest possible data and action scope.
3. **Read before write.** The first release favors read-only and simulated workflows.
4. **Explicit consent.** Account linking, context use, and sensitive data access must be visible and revocable.
5. **Policy enforcement is centralized.** Authentication, authorization, compliance, rate limits, audit, and safety controls cannot be implemented inconsistently per host.
6. **Host independence.** Domain APIs and tool contracts should remain reusable across compatible AI hosts.
7. **Fail safely.** AI or MCP outages must not affect exchange, wallet, ledger, authentication, or Academy integrity.
8. **No hidden persuasion.** Mentor and Academy tools optimize for competence, risk awareness, and learning outcomes.
9. **Version everything.** Tool schemas, prompts, policies, evaluations, and breaking changes require version control.
10. **Observable and testable.** Every production tool requires telemetry, abuse monitoring, evaluation cases, and rollback capability.

---

## 7. Security and Privacy Gates

Before public release, the implementation must provide:

- Threat model for MCP, account linking, tokens, prompt injection, data exfiltration, confused-deputy attacks, and malicious tool arguments.
- Per-tool authentication and authorization scopes.
- Server-side enforcement independent of model instructions.
- Input/output validation with strict schemas.
- Audit events for account linking, consent, tool calls, denied actions, and data access.
- Secret isolation and rotation.
- Rate limiting, quotas, anomaly detection, and abuse controls.
- Data minimization and field-level filtering.
- Consent revocation and account unlinking.
- Retention and deletion behavior consistent with TecPey policy.
- Red-team tests for prompt injection, cross-user access, tenant leakage, and prohibited financial actions.

No AI host receives direct wallet keys, signing material, unrestricted database access, or internal administrative credentials.

---

## 8. Success Metrics

Primary measures:

- Academy assessment completion.
- Lesson progression and mastery improvement.
- Safe transition into Trading Arena simulation.
- Mentor feedback usefulness.
- Reduction in repeated behavioral mistakes.
- Qualified account linking and retained learning engagement.
- User trust, consent clarity, and low support burden.

Guardrail measures:

- Security and privacy incidents.
- Unauthorized or excessive data access.
- Financial-advice or profit-promise violations.
- Tool-call failure and hallucinated-action rates.
- Cost per successful learning outcome.
- Complaints, account unlinking, and policy violations.

Trading volume is not a primary success metric for this channel.

---

## 9. Required Artifacts Before Implementation

- Product requirements document.
- Tool inventory and scope classification.
- MCP/API contract specification.
- Identity, OAuth/account-linking, and consent design.
- Threat model and privacy impact assessment.
- Compliance and platform-policy review.
- UX flows and error/fallback states.
- Evaluation suite and red-team plan.
- Observability and incident-response plan.
- Launch and rollback checklist.

---

## 10. Permanent Decision

TecPey must be **MCP-ready and API-first now**, while protecting the soft launch from feature expansion. The public ChatGPT experience is built only after the relevant core services are stable, secure, durable, and governed.

This strategy is a permanent architectural reservation and must be considered when changing Academy, Mentor AI, Trading Arena, identity, consent, Developer Platform, and AI Platform boundaries.
