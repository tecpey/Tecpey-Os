# TecPey Intelligence Fabric v1

**Status:** Draft architecture decision for staged implementation  
**Scope:** News, Organic Growth, Content Automation, AI Mentor, provider routing, knowledge promotion, evidence, cost and observability  
**Safety:** This document does not authorize provider activation, staging/production deployment, publication or financial effects.

## Executive decision

TecPey MUST NOT evolve News Automation, Organic Growth Automation and AI Mentor as independent AI products with separate provider logic. They are different experiences over one governed intelligence system.

The target architecture is **TecPey Intelligence Fabric**:

`Sources -> Durable Evidence -> Intelligence Tasks -> Knowledge Candidates -> Verified Knowledge -> Experiences`

Every paid/provider request crosses one governed AI egress boundary. Every cross-domain update crosses one durable event boundary. Models create candidates and explanations; deterministic code and governed authorities decide identity, persistence, validation, promotion and external effects.

## Architecture Council perspective

### CTO / Chief Architect

- One provider-independent execution contract for News, Growth, Content and Mentor.
- No direct provider calls from domain workers.
- Provider/model choice is task- and eval-driven, not hard-coded by feature.
- PostgreSQL remains durable authority; Redis/BullMQ is delivery/coordination, never the source of truth.
- Avoid a new workflow control plane until current infrastructure proves it is insufficient.

### CISO

- Data-class and tenant/workspace scope are evaluated before provider egress.
- Secrets, prompt injection and unsupported private context are blocked before expensive work begins.
- Private Mentor state never flows into public News/Growth research.
- Raw public research never becomes trusted Mentor knowledge without promotion authority.
- Zero-data-retention capability is a route requirement where policy requires it, not a provider marketing assumption.

### CFO / FinOps

- Reserve spend before every paid network attempt.
- Attribute spend to task, workflow, resource version, provider, model, reason and retry ordinal.
- Unknown cost after egress is conservatively accounted.
- Expensive fallback is not a reliability primitive; alternate routes require remaining spend authority.
- Prompt caching, deterministic preprocessing, compact context and batch/offline processing are first-class optimizations.
- Cost controls may defer AI enrichment but MUST NOT suppress raw News capture.

### CPO / Head of Learning

- Mentor answers from approved Academy material, verified knowledge and consented learner state.
- Social/news attention is not learner truth and cannot directly alter a learner profile.
- Personalization must remain explainable: current progress, durable memory, recent session and behavioral snapshot are separate sources with freshness/provenance.
- Mentor is educational coaching, never autonomous financial advice or execution.

### Head of Content / Editorial

- Capture, translation, editorial validation and publication are distinct states.
- Source evidence and numerical facts are immutable inputs to translation/review.
- Translation is not fact discovery. Research is not publication.
- AI output is a candidate until deterministic checks and required review gates pass.

### Head of Growth

- Search, X, web, News, coin/tool and aggregate product signals join at the Evidence/Signal layer.
- Attention is not truth and is not investment quality.
- Trend promotion requires independent corroboration, manipulation-risk controls and measurable post-publication outcomes.

### SRE

- Cross-domain work uses transactional outbox/event-ledger semantics.
- Delivery is at-least-once; consumers MUST be idempotent.
- Every event has stable identity, schema version, correlation/causation IDs and replay evidence.
- No in-process fire-and-forget path is authoritative for cross-domain state.
- Every AI call is traceable from source event to final candidate/published artifact.

### Head of AI / ML

- The router optimizes for task-specific eval performance under policy/cost/latency limits.
- Provider-level capability flags are insufficient; model candidates need task-eval evidence.
- Machine-consumed outputs use strict JSON Schema whenever the provider supports it.
- Multi-agent execution is reserved for genuinely parallel, high-value research/synthesis; routine capture, translation and classification remain deterministic or single-model.
- Model aliases that can silently migrate are not production evidence. Active candidate identities and observed response model are recorded.

## Core invariants

1. **Capture never depends on AI.** Raw approved News/source events are persisted first.
2. **No direct provider egress from domain code.** News, Growth, Mentor and Automation call a shared governed execution authority.
3. **No implicit retries.** Retry eligibility, delay, attempt budget and spend budget are explicit per task.
4. **No free-form machine protocol.** Internal machine outputs use versioned schemas where supported.
5. **No evidence laundering.** A generated statement cannot become trusted knowledge merely because another model summarized it.
6. **No private/public context mixing.** Public research routes cannot receive Mentor private context.
7. **No AI publication authority.** Publication/knowledge promotion remains a separate governed effect.
8. **No cost ambiguity without evidence.** Ambiguous paid egress is conservatively settled and flagged for reconciliation.
9. **No silent continuity claim.** Source continuity is proven, degraded or explicitly unknown.
10. **Current environment wins over memory.** Learned Mentor memory can be stale and is never treated as live market/account state.

## Planes

### 1. Source & Capture Plane

Inputs include registered News feeds, publisher pages, X/public web research, search analytics, coin/tool catalogs, Academy events, Arena events and governed aggregate metrics.

Capture jobs are deterministic and provider-independent. They produce immutable/versioned source artifacts with canonical identity, source timestamp, fetch timestamp, content hash and provenance.

For News, five-minute polling is a cadence objective, not a zero-loss proof. Each source requires a continuity strategy:

- overlap/watermark proof for normal RSS operation;
- source-specific pagination/API/archive recovery where available;
- explicit `continuity_unproven` and operational alert when recovery cannot be proven.

### 2. Evidence Plane

Normalize captured artifacts into versioned Evidence Objects. AI may assist extraction only after raw evidence exists.

Minimum evidence contract:

- `evidenceId`
- `sourceType`
- `sourceName`
- `canonicalUrl`
- `sourcePublishedAt`
- `capturedAt`
- `contentHash`
- `rawArtifactId`
- `locale`
- deterministic entity references where possible
- deterministic numeric-fact ledger where possible
- provenance and freshness metadata

Numbers, dates, tickers, URLs and source identities should be extracted deterministically first whenever feasible. A model may label/interpret them, but must not invent their authority.

### 3. Intelligence Task Plane

All provider work is declared through `intelligence-task-catalog.ts`. A task contract specifies:

- responsible agent
- data class / criticality
- required capabilities
- tool policy
- output protocol
- cache policy
- retry policy
- maximum provider attempts
- knowledge read/write policy
- eval suite
- budget/latency class

The domain asks for a task outcome. It does not choose a provider directly.

### 4. Candidate / Validation Plane

Provider outputs become typed candidates:

- translation candidate
- trend signal candidate
- content opportunity candidate
- knowledge candidate
- Mentor response candidate
- executive synthesis candidate

Each candidate contains input/evidence hashes and route/usage evidence. Validation can reject without mutating source evidence.

### 5. Knowledge Plane

Only promoted Knowledge Objects are available to trusted product experiences.

Knowledge Objects are versioned and include:

- statement/content
- subject/entity
- evidence references
- confidence
- verifier/promotion policy version
- locale
- valid-from / freshness / optional expiry
- supersession/contradiction state
- data class

News articles and Growth trends do **not** directly enter Mentor memory. A `knowledge_curate` task can create a candidate; promotion authority decides whether it becomes verified knowledge.

### 6. Experience Plane

- **News:** publish validated localized content from exact source versions.
- **Organic Growth:** produce ranked, cited opportunities and experiments; no direct publication.
- **Content:** transform approved evidence/knowledge into drafts, then use editorial/publish authority.
- **Mentor:** combine verified knowledge + Academy curriculum + consented learner state + progressive memory retrieval.

## Unified AI Egress Gateway

Target provider flow:

`task request -> policy -> task eval/routing -> spend reservation -> durable egress mark -> provider -> schema/guardrail validation -> settlement -> trace/eval -> typed result`

The existing TecPey managed-AI control plane already implements much of spend admission, egress marking, failover, route decisions and evidence. The migration strategy is to converge domains on that authority after its tenant-isolation launch blocker is formally admitted, not weaken that blocker.

Until then, News may retain its domain-scoped incident cost authority as a temporary containment boundary. No other domain should create a third spend authority.

### Hard rule

`callAiProvider()` and raw provider HTTP adapters become infrastructure-private. Domain workers MUST NOT call them directly.

## Provider and model strategy

There is no globally "best" model. Production routing is **task-tier + eval**.

The following are candidate lanes for evaluation, not automatic production defaults:

| Workload | Candidate tier | Rationale |
|---|---|---|
| High-volume translation/extraction/classification | economy | Evaluate GPT-5.6 Luna and Claude Haiku-class candidates for Persian fidelity, numeric preservation and schema adherence. |
| Normal Mentor coaching / content review | balanced | Evaluate GPT-5.6 Terra and Claude Sonnet 5 for quality/cost/latency. |
| Difficult learner reasoning / executive synthesis | frontier escalation | GPT-5.6 Sol and Claude Opus/Fable-class candidates only when task risk/complexity justifies escalation. |
| Recurring X/public trend scan | search-native efficient | Evaluate Grok 4.3-class route for recurring scans; use Grok 4.6-class capability selectively for complex synthesis. |
| Routine web-grounded research | search-native | Sonar/Sonar Pro-class route with citations and bounded search context. |
| Exhaustive strategic research | deep research | Deep Research only for scheduled/on-demand dossiers, never every five-minute scan. |

Production route selection requires TecPey eval evidence. Public benchmark leadership alone is insufficient.

### Model identity policy

- Record requested and observed model identity.
- Reject retired/deprecated model IDs in release gates.
- Avoid aliases known to silently redirect when exact identity matters for evidence/cost.
- Provider/model catalog freshness is checked periodically and before release activation.

## Structured outputs

Machine-consumed outputs MUST use strict provider schema mechanisms where available:

- OpenAI Responses structured outputs / schema contract
- Anthropic JSON output schemas / strict tool schemas
- xAI JSON Schema structured outputs
- Perplexity JSON Schema structured outputs

Manual fenced-JSON stripping and `JSON.parse()` are legacy fallback behavior only. A provider route that cannot satisfy a required schema is ineligible for that task.

URLs/citations remain provider evidence fields or independently validated source records; they are not trusted merely because a schema-valid model string contains a URL.

## Prompt/context caching

Caching is safe only for stable, policy-approved prefixes.

Good candidates:

- versioned system instructions
- stable tool schemas
- approved Academy curriculum version
- immutable evidence packages reused in a bounded workflow
- growing Mentor session history where provider/workspace privacy policy permits it

Do not cache secret-bearing or cross-tenant mixed context. Cache hit/write tokens and cache-key version are part of spend telemetry.

## Mentor memory v2

Replace fixed context dumping with progressive disclosure:

1. **Session state:** recent current-thread turns.
2. **Learner profile:** stable, explainable traits/goals with provenance and update timestamp.
3. **Durable memories:** semantic, category-scoped memories with importance, confidence, source event and freshness.
4. **Current snapshots:** Academy progress, Arena discipline/risk and other live state loaded from current authorities.
5. **Verified knowledge retrieval:** only relevant Knowledge Objects.

The initial prompt receives a compact context summary. Detailed memories/knowledge are retrieved only when relevance requires them. Current database state overrides stale learned memory.

Profile/memory updates become durable event consumers rather than best-effort in-process side effects.

## Event backbone

For the current TecPey deployment, use **PostgreSQL transactional outbox + append-only event ledger + BullMQ delivery** rather than introducing a new orchestration platform immediately.

Why:

- PostgreSQL is already TecPey's durable authority.
- BullMQ/Redis already exists operationally.
- Transactional outbox closes DB-write/event dual-write gaps.
- At-least-once delivery is acceptable when all consumers are idempotent.
- It has lower operational surface than introducing a second durable workflow control plane on the current single-server topology.

Design event semantics so migration to a durable workflow engine remains possible if workload complexity later requires it.

### Event envelope

Every event contains at least:

- `eventId`
- `eventType`
- `schemaVersion`
- `occurredAt`
- `recordedAt`
- `tenantId` / `workspaceId` where applicable
- `aggregateType` / `aggregateId`
- `resourceVersion` or content hash
- `correlationId`
- `causationId`
- `idempotencyKey`
- data class
- payload hash

Consumers persist processed-event identity transactionally with their state mutation.

## Cross-domain event flow

Example:

`news.article.captured.v1`
→ translation candidate
→ validation
→ `news.article.localized.v1`
→ publication candidate
→ `news.article.published.v1`
→ Growth signal enrichment
→ optional `knowledge.candidate.created.v1`
→ Knowledge review/promotion
→ `knowledge.promoted.v1`
→ Mentor verified-knowledge index refresh

A published News item does not automatically become Mentor memory. A learner reading/responding to it may create a separate learner event, which can later inform the learner profile under consented policy.

## Evaluation system

Routing becomes meaningful only when TecPey has its own datasets.

Required eval suites:

### News translation

- Persian fluency
- title/lead factual coverage
- exact numeric preservation
- named-entity preservation
- no added advice
- schema adherence
- latency
- cost per successful article

### Growth intelligence

- citation precision
- independent-source diversity
- stale-source rejection
- trend precision after 24h/72h
- manipulation false-positive/false-negative rate
- cost per accepted signal

### Mentor

- curriculum correctness
- safety / no investment instruction
- personalization relevance
- memory precision and stale-memory resistance
- appropriate uncertainty
- verified-knowledge grounding
- Persian conversational quality
- learner outcome proxies

### Content

- factual support
- citation coverage
- editorial quality
- SEO/AEO usefulness without keyword stuffing
- duplicate-content risk

Models are promoted by eval thresholds and canary/shadow evidence, not preference.

## Observability

Adopt OpenTelemetry-compatible correlation across:

`source capture -> event -> AI admission -> provider attempt -> validation -> knowledge/publish -> experience`

Record safe metadata:

- workflow/task ID
- provider and requested/observed model
- input/output/cached token counts
- reservation/settled cost
- latency and attempt ordinal
- cache result
- route decision hash
- schema/guardrail outcome
- evidence/content hashes
- correlation/causation IDs

Raw prompts, private user content and model outputs are not telemetry by default.

## Migration phases

### Phase 0 — incident containment

Complete PR #622 and keep all new provider/timer activation disabled until exact-head CI and staging evidence are green.

### Phase 1 — common task contract

- Add Intelligence Task Catalog.
- Add task-aware route eligibility.
- Add structured-output capability contract.
- Add model lifecycle/deprecation evidence.

### Phase 2 — unify Organic Growth egress

Replace direct `callAiProvider()` calls with governed admission/egress/settlement/routing. Add kill switch, task budget, schema outputs and per-provider attempt evidence.

### Phase 3 — evidence/event backbone

Add transactional outbox and shared event envelope. Emit News/Growth/Knowledge events atomically with domain state.

### Phase 4 — Knowledge Objects

Add candidate, contradiction, freshness and promotion contracts. Connect approved knowledge to Mentor retrieval.

### Phase 5 — Mentor orchestration v2

Move orchestration out of the large request route into an application service, introduce progressive memory retrieval and durable profile-update events, then add caching/eval-driven model escalation.

### Phase 6 — provider consolidation

After managed AI tenant-isolation evidence is formally admitted, migrate News's temporary domain cost authority into the unified managed-AI egress authority. Remove all remaining domain-direct provider paths.

### Phase 7 — controlled activation

Provider-disabled staging first, then bounded canary, replay/idempotency/cost reconciliation, failure drills, model shadow evals and only then controlled production activation.

## Release NO-GO conditions

Do not activate if any are true:

- a domain worker can call a provider outside governed egress;
- a machine-consumed AI response lacks required schema validation;
- provider model identity is deprecated/unknown;
- a paid attempt can start without durable reservation/egress evidence;
- a retry can occur without finite task budget;
- News capture depends on AI availability/budget;
- public research can receive private Mentor context;
- unverified News/Growth output can enter trusted Mentor knowledge;
- event delivery is authoritative without durable outbox/idempotent consumer evidence;
- full exact-head CI/staging evidence is incomplete.

## External architecture references reviewed

- OpenAI GPT-5.6 family, pricing/caching and task-tier guidance: https://openai.com/index/gpt-5-6/ and https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/
- Anthropic current model/prompt-caching/structured-output docs: https://platform.claude.com/docs/
- xAI Grok 4.3/4.6, prompt caching and structured output docs: https://docs.x.ai/
- Perplexity Agent/Sonar structured output and pricing docs: https://docs.perplexity.ai/
- AWS transactional outbox pattern: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
- Temporal durable execution reference model: https://docs.temporal.io/
- OpenTelemetry semantic conventions: https://opentelemetry.io/docs/specs/semconv/

These references inform the architecture. TecPey production model selection remains gated by TecPey-specific evals and security/cost evidence.
