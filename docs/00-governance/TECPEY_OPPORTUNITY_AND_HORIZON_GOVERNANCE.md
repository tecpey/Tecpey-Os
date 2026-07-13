# TecPey Opportunity & Strategic Horizon Governance

**Version:** 1.0  
**Date:** 2026-07-13  
**Status:** Mandatory governance standard  
**Accountable owner:** CEO Office / Chief Strategy function  
**Operational owner:** CPO  
**Applies to:** All TecPey C-level agents, directors, architects, product owners, and implementation agents

---

## 1. Purpose

TecPey leadership must not operate as a passive request-execution system. Every executive owner is responsible for discovering missing capabilities, emerging risks, architectural reservations, distribution shifts, regulatory changes, user-experience opportunities, and technologies that could materially affect TecPey.

This governance prevents two opposite failures:

1. **Strategic blindness:** important opportunities are ignored because they were not explicitly requested.
2. **Strategic distraction:** attractive ideas interrupt the critical path to soft launch without evidence, ownership, or dependency review.

The required behavior is:

> Discover proactively. Record durably. Challenge cross-functionally. Evaluate rigorously. Execute only through an approved priority gate.

---

## 2. No-Prompt-Dependency Rule

The absence of a topic from a user prompt, backlog, roadmap, or meeting agenda is not permission to ignore it.

Every executive must continuously ask:

- What important capability is missing from my domain?
- What external change could make a current decision obsolete?
- What will cause costly redesign if it is not reserved in the architecture now?
- What new distribution surface, platform, regulation, standard, user behavior, or competitor pattern should TecPey evaluate?
- What risk is currently hidden by optimistic assumptions?
- What reusable infrastructure could serve multiple TecPey pillars or future products?

Managers remain accountable for their domain even when the CEO or user did not explicitly mention the issue.

---

## 3. Strategic Horizon Scan

A Strategic Horizon Scan is mandatory:

- At the end of every implementation phase.
- Before approving a major architecture or product boundary.
- Before soft-launch and public-launch gates.
- After material changes in relevant platforms, regulation, security threats, standards, or user behavior.
- When a new external dependency or distribution channel is proposed.

Each executive submits a concise scan containing:

1. **New opportunity:** What could create material value?
2. **New threat:** What could harm trust, launch readiness, security, compliance, or strategic position?
3. **Missing capability:** What should already exist but does not?
4. **Architectural reservation:** What must be prepared now even if built later?
5. **Recommended action:** Build now, architect now/build later, limited experiment, post-launch, monitor, or reject.
6. **Evidence:** Source, user signal, technical finding, policy change, market movement, or explicit reasoning.
7. **Owner and review date:** Who owns the next decision and when must it be revisited?

A scan that reports “nothing found” must still state what was reviewed and why no action is recommended.

---

## 4. Executive Domain Responsibilities

### CEO / Chief Strategy

- Detects cross-pillar strategic gaps and unresolved ownership.
- Protects TecPey's mission and launch priority.
- Ensures high-impact opportunities are neither ignored nor adopted impulsively.

### CPO

- Scans product expectations, user behavior, UX patterns, platform distribution, monetization integrity, and product-market shifts.
- Owns the Opportunity Register process.
- Converts approved opportunities into product decisions and roadmap candidates.

### CTO / Chief Architect

- Scans architecture, standards, infrastructure, platform dependencies, technical debt, scalability, interoperability, and future redesign risk.
- Identifies “architect now, build later” requirements.

### CAIO

- Scans model capabilities, agent systems, MCP/tool ecosystems, evaluation methods, memory, knowledge graphs, safety, cost, and AI platform opportunities.
- Ensures AI opportunities strengthen shared infrastructure rather than creating isolated demos.

### CISO

- Scans threats, abuse patterns, supply-chain risks, authentication changes, data exposure, AI-specific attacks, and operational security gaps.
- May block experimentation when controls are insufficient.

### Compliance / Legal

- Scans laws, regulations, platform policies, financial-services boundaries, privacy obligations, sanctions, disclosures, and jurisdictional risk.

### CGO / CMO

- Scans acquisition channels, search/discoverability, partnerships, communities, AI distribution, retention patterns, and brand-positioning shifts.
- Growth proposals must preserve education-first and trust-before-volume principles.

### COO / SRE / Operations

- Scans reliability, support burden, incident patterns, vendor resilience, operational capacity, deployment, recovery, and cost-to-operate.

### CFO / Finance

- Scans unit economics, runway, vendor concentration, pricing risk, financial controls, reconciliation, and investment sequencing.

### Academy Director

- Scans pedagogy, curriculum gaps, assessment validity, learner safety, accessibility, certification trust, and educational outcomes.

### Trading Arena Director

- Scans simulation realism, anti-gaming, risk education, behavioral measurement, fairness, market-data quality, and progression integrity.

### Mentor AI Lead

- Scans behavioral intelligence, explainability, memory quality, intervention safety, evaluation, personalization, and user control.

---

## 5. Cross-Executive Challenge

Before a major phase closes, each proposal must be challenged by at least one executive outside the owning function.

Minimum challenge questions:

- **Product:** Is there a clear user problem and measurable value?
- **Architecture:** Does this duplicate logic or create future lock-in?
- **Security:** What new attack surface or privilege is introduced?
- **Compliance:** Is any action, data flow, or claim prohibited or jurisdiction-sensitive?
- **Operations:** Can this be monitored, supported, rolled back, and recovered?
- **Finance:** Does the opportunity justify its total cost and distraction risk?
- **Strategy:** Does it strengthen a permanent TecPey pillar or create an orphan feature?
- **Launch:** Will it delay or endanger the current soft-launch critical path?

No executive may approve a high-impact proposal solely within their own silo.

---

## 6. Opportunity Register

All material opportunities must be recorded in a durable Opportunity Register. Chat messages, verbal agreements, and isolated prompts are not sufficient records.

Each entry must contain:

| Field | Requirement |
|---|---|
| Opportunity ID | Stable identifier, e.g. `OPP-2026-001` |
| Title | Clear, outcome-oriented name |
| Date discovered | ISO date |
| Discovering owner | Person/role/agent |
| Executive sponsor | Accountable C-level owner |
| Pillars affected | One or more permanent TecPey pillars |
| User problem/value | Why it matters |
| Strategic value | Low / Medium / High / Transformational |
| Soft-launch impact | Accelerates / Neutral / Delays / Risks |
| Architectural implication | What must change or be reserved |
| Reuse potential | Other pillars, white-label, AstroLink, partners |
| Security/privacy risk | Summary and required review |
| Compliance/legal risk | Summary and required review |
| Cost/complexity | Relative estimate with major dependencies |
| Evidence | User signal, source, prototype, benchmark, or analysis |
| Decision state | See Section 7 |
| Owner | Responsible next-action owner |
| Review date | Required reconsideration date |
| Decision link | Decision log, issue, ADR, or approved plan |

Duplicates are linked and consolidated rather than silently discarded.

---

## 7. Decision States

Every opportunity receives exactly one active state:

### BUILD_NOW

Required for soft launch, security, compliance, product integrity, or an approved critical objective. Must have owner, scope, acceptance criteria, and dependency clearance.

### ARCHITECT_NOW_BUILD_LATER

Implementation is deferred, but current interfaces, data models, service boundaries, or platform choices must preserve the future capability. This state is preferred for strategically important ideas that must not distract from soft launch.

### LIMITED_EXPERIMENT

A bounded, isolated, reversible experiment with explicit hypothesis, budget, data restrictions, success criteria, and end date.

### POST_LAUNCH

Approved in principle but blocked by core maturity, dependencies, staffing, policy, or launch sequencing.

### MONITOR

Insufficient evidence or immature external conditions. Must have a review trigger or date.

### REJECT

Conflicts with strategy, safety, compliance, economics, architecture, or user trust. Rejection rationale is recorded to prevent repeated debate without new evidence.

No opportunity may remain indefinitely in an undefined “interesting idea” state.

---

## 8. Evaluation Scorecard

Use a 1–5 score for each criterion, supported by evidence:

- Strategic alignment with TecPey OS.
- User value and problem severity.
- Differentiation and defensibility.
- Contribution to Academy, Arena, Mentor, Exchange, or shared platform strength.
- Reuse across products, tenants, channels, or future businesses.
- Time-to-value.
- Technical feasibility and maintainability.
- Security and privacy readiness.
- Compliance and legal feasibility.
- Operational supportability.
- Economic value and total cost.
- Soft-launch compatibility.

High aggregate score does not override a security, compliance, or launch-blocking veto.

---

## 9. Soft-Launch Protection Gate

Until soft launch, all new opportunities default to `ARCHITECT_NOW_BUILD_LATER`, `MONITOR`, or `REJECT` unless they satisfy one of these conditions:

- Close a P0/P1 security, compliance, data integrity, wallet, trading, identity, QA, or operations blocker.
- Correct a serious Academy, Arena, Mentor, or core UX failure.
- Prevent imminent architectural rework with a small bounded change.
- Are explicitly approved as critical by the implementation gate owners.

“Strategically exciting” is not sufficient reason to enter `BUILD_NOW`.

---

## 10. Executive Challenge Protocol for AI Agents

Every C-level or specialist AI agent working on TecPey must:

1. Read the Master Blueprint and applicable governance documents.
2. Execute the assigned task without silently expanding scope.
3. Proactively identify material omissions, risks, and opportunities adjacent to the task.
4. Separate findings into:
   - blocking now,
   - architect now/build later,
   - post-launch opportunity,
   - informational observation.
5. Add or propose durable register entries for material items.
6. State assumptions and evidence.
7. Avoid broad re-audits when targeted verification is sufficient.
8. Never implement a new strategic opportunity without approval and dependency review.

This requirement strengthens the existing Architect Guardian role: the agent is both executor and disciplined challenger, not a passive command follower and not an uncontrolled ideation engine.

---

## 11. Review Cadence

- **Per phase:** short horizon scan from each relevant owner.
- **Weekly during hardening:** review only launch-critical and architecture-reservation items.
- **Monthly after soft launch:** full Opportunity Register review.
- **Quarterly:** cross-pillar strategic horizon review and removal/consolidation of stale entries.
- **Event-driven:** immediate review after material platform, regulation, security, or market changes.

---

## 12. Initial Registered Opportunity

**ID:** `OPP-2026-001`  
**Title:** ChatGPT / MCP as a TecPey distribution and product channel  
**State:** `ARCHITECT_NOW_BUILD_LATER`  
**Sponsor:** CPO  
**Joint owners:** CAIO, CTO, CGO/CMO, CISO, Compliance/Legal  
**Immediate action:** Preserve API-first, MCP-ready boundaries without delaying soft launch.  
**Post-stabilization action:** Build a limited, high-quality Academy + Mentor AI + educational Arena experience after security, identity, persistence, consent, and audit prerequisites pass.  
**Decision reference:** `docs/18-developer/TECPEY_AI_DISTRIBUTION_AND_MCP_STRATEGY.md`

---

## 13. Permanent Rule

TecPey executives are accountable not only for executing known work but also for discovering what the organization has failed to see. Discovery creates a proposal, not automatic scope. Every proposal must be recorded, challenged, evaluated, and sequenced through this governance.
