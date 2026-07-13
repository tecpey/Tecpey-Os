# TecPey Decision Log

**Version:** 1.0  
**Established:** 2026-07-13  
**Status:** Permanent governance record

This document records approved strategic, product, architecture, security, compliance, and operating decisions that must survive individual sessions, prompts, and implementation phases.

## Entry Template

```markdown
## DEC-YYYY-NNN — Decision title

- Date:
- Status: Proposed | Approved | Superseded | Rejected
- Accountable owner:
- Consulted owners:
- Pillars affected:
- Context:
- Decision:
- Rationale:
- Consequences:
- Preconditions / gates:
- Related documents:
- Supersedes:
- Review trigger:
```

---

## DEC-2026-001 — Establish AI Distribution & Ecosystem as a Permanent TecPey Capability

- **Date:** 2026-07-13
- **Status:** Approved
- **Accountable owner:** Chief Product Officer (CPO)
- **Consulted owners:** CAIO, CTO, CGO/CMO, CISO, Compliance/Legal, CEO Office
- **Pillars affected:** Academy, Mentor AI, Trading Arena, AI Platform, Developer Platform, Identity, Compliance & Trust, Analytics, White-Label

### Context

Conversational AI platforms are evolving from standalone assistants into product-discovery and service-delivery surfaces. TecPey's education-first journey, Mentor AI, Trading Arena simulation, behavioral intelligence, and future Developer Platform can create a valuable conversational product experience. Failing to reserve this channel could cause lost distribution opportunity and later architectural rework.

The opportunity must not distract from the current soft-launch hardening program or expose real-money, custody, wallet-signing, private-data, or financial-advice capabilities through an insufficiently governed integration.

### Decision

1. Create **AI Distribution & Ecosystem** as a permanent cross-cutting TecPey capability.
2. Adopt the strategic architecture direction:

   ```text
   TecPey Core -> API Platform -> MCP Server -> ChatGPT App -> Other compatible AI hosts
   ```

3. Design the first public experience around **Academy + Mentor AI + educational/simulated Trading Arena capabilities**.
4. Keep the first release primarily read-only, educational, simulated, consent-based, and risk-aware.
5. Keep real-money trading, deposits, withdrawals, transfers, custody, signing, and personalized financial advice outside the first public AI-host release.
6. Make the platform API-first and MCP-ready now, but defer full public implementation until soft-launch prerequisites and relevant security, identity, persistence, consent, audit, compliance, and operational gates pass.
7. Assign CPO as accountable owner, with joint ownership across CAIO, CTO, Growth/Marketing, CISO, and Compliance/Legal.
8. Operate the function under the interim responsibility **Head of AI Distribution & Ecosystem**, jointly led by CPO + CAIO until a dedicated team is justified.

### Rationale

- Meets users at the moment they express educational or risk-management intent.
- Reinforces TecPey's education-first acquisition model.
- Creates reusable API, MCP, consent, identity, and AI Gateway infrastructure.
- Extends the value of Mentor AI and behavioral intelligence without duplicating core business logic.
- Preserves compatibility with future AI hosts, enterprise assistants, white-label deployments, and later products.
- Avoids delaying soft launch through the `ARCHITECT_NOW_BUILD_LATER` sequencing decision.

### Consequences

- Academy, Mentor, Arena, identity, consent, and Developer Platform changes must consider future MCP/tool boundaries.
- Core business logic must remain within governed TecPey services.
- Tool schemas, scopes, prompts, policies, and evaluations require versioning and auditability.
- A future public release requires dedicated threat modeling, privacy review, compliance review, evaluation, observability, rollback, and platform-policy validation.
- Success is measured primarily through learning outcomes, safe progression, user trust, and Mentor usefulness—not trading volume.

### Preconditions / gates

- P0 soft-launch security blockers closed.
- Stable identity and account-linking model.
- Durable server-side data for required Academy/Mentor/Arena context.
- Consent and revocation controls.
- Central authorization, rate limiting, audit logging, and observability.
- MCP/tool threat model and red-team tests.
- Compliance, legal, privacy, and relevant host-platform policy approval.
- Rollback and incident-response readiness.

### Related documents

- `docs/TECPEY_MASTER_BLUEPRINT.md`
- `docs/18-developer/TECPEY_AI_DISTRIBUTION_AND_MCP_STRATEGY.md`
- `docs/00-governance/TECPEY_OPPORTUNITY_AND_HORIZON_GOVERNANCE.md`

### Review trigger

Review after core stabilization and before beginning a production MCP server or public ChatGPT app.

---

## DEC-2026-002 — Require Proactive Strategic Horizon Scanning by All TecPey Executives

- **Date:** 2026-07-13
- **Status:** Approved
- **Accountable owner:** CEO Office / Chief Strategy function
- **Operational owner:** CPO
- **Consulted owners:** All TecPey C-level and domain owners
- **Pillars affected:** All

### Context

A passive management model that only executes explicit prompts can miss major product, technology, distribution, security, compliance, and architectural developments. Conversely, uncontrolled ideation can derail the soft-launch critical path.

### Decision

1. Apply a permanent **No-Prompt-Dependency Rule**: managers remain responsible for material issues in their domain even when those issues were not explicitly requested.
2. Require a concise **Strategic Horizon Scan** at every phase boundary and other material decision points.
3. Maintain a durable **Opportunity Register** for significant opportunities, threats, missing capabilities, and architectural reservations.
4. Require cross-executive challenge for high-impact proposals.
5. Assign every opportunity one controlled decision state:
   - `BUILD_NOW`
   - `ARCHITECT_NOW_BUILD_LATER`
   - `LIMITED_EXPERIMENT`
   - `POST_LAUNCH`
   - `MONITOR`
   - `REJECT`
6. Preserve soft-launch priority: discovery creates a proposal, not automatic implementation scope.
7. Strengthen the Architect Guardian role so AI agents actively identify omissions and risks while avoiding uncontrolled scope expansion.

### Rationale

This creates durable organizational awareness, cross-functional accountability, and controlled innovation without forcing the CEO/user to personally discover every important angle.

### Consequences

- Phase completion reports must include relevant horizon findings.
- Material findings cannot remain only in chat history.
- High-impact proposals require ownership, evidence, risk review, and sequencing.
- Managers cannot use “it was not in the prompt” as justification for missing a material issue.
- Managers also cannot implement attractive new work without passing priority and dependency gates.

### Related documents

- `docs/00-governance/TECPEY_OPPORTUNITY_AND_HORIZON_GOVERNANCE.md`
- `docs/TECPEY_MASTER_BLUEPRINT.md`

### Review trigger

Review after two implementation phases to assess whether scans are producing useful findings without excessive process or token consumption.
