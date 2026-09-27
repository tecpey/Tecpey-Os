# Academy: Infinite Growth + assessment quality + adaptive remediation

**Reconciled main authority:** `3901d820a0ce5162fb61704add221183710a0e5f`

**Dependencies:** Existing Academy authority + Mentor evidence; Notifications may consume durable learning events later.

**Academy V3 continuation authority:** `docs/program/09_ACADEMY_V3_LEARNING_OS_PRODUCT_CONSTITUTION.md`. The V3 constitution preserves the cross-system redesign decisions for curriculum, evidence, assessment, gamification, League, Progress Core, Arena, Mentor and experience architecture. Material implementation decisions must be checked against both documents; conflicts require an explicit documented resolution rather than silent drift.

## Global quality bar

- Authority-sensitive state is server-owned, tenant-bound and fail-closed; clients cannot create entitlement, identity, mastery, rank or safety truth.
- No fabricated intelligence without named authority + provenance/freshness.
- Content-first design; glass only for navigation/controls/light overlays; no glass-on-glass.
- WCAG 2.2 AA minimum, 44px preferred primary targets, visible focus, reduced-motion/transparency-safe behavior.
- FA/EN parity, RTL/LTR correctness, logical CSS, bidi isolation.
- Schema validation, CSRF/rate limits, session/tenant checks, idempotency/replay defense, audit logs and negative tests.
- Structured logs, reason codes, degraded states and exact freshness.
- TypeScript, ESLint, unit/integration/security/browser tests, repository audit and exact-head CI.
- Immutable exact-SHA staging-first release with rollback proof; Production requires separate explicit approval.


## Objective
Make Academy defensible as a serious learning system: high-quality assessment, durable retention and a real Term 8 Infinite Growth loop.

## Deliverables
- Full Terms 1–7 item-bank audit: correctness, distractors, explanations, difficulty, duplication and locale parity.
- Correct-answer positions randomized/balanced with bias tests.
- Item provenance/versioning; retired items never rewrite historical results.
- Assessment authority distinguishes exposure, practice, retrieval success, reassessment and mastery.
- Adaptive loop: Diagnose → Explain → Socratic prompt → Worked example → Micro challenge → Retrieval → Reassess → Remediate.
- Observable/versioned spaced review.
- Term 8 continuously selects weak/decaying concepts, relevant current context, retrieval/practice and reflection; never “completed forever”.
- Interleaving/metacognitive prompts where appropriate.
- Mentor can consume governed evidence; self-report alone cannot create mastery.
- Certificates/final exam governed; scholarship/job/funded-account eligibility is separate authority.
- No opaque intelligence/mastery score.

## Research-derived learning controls

A 2024 systematic review in health-professions education found that many included experiments showed benefit from distributed and/or retrieval practice, while intervention design and outcomes varied. TecPey therefore treats spacing/retrieval as evidence-informed mechanisms whose policy is versioned—not as a universal fixed formula.

Primary reference:
- https://pubmed.ncbi.nlm.nih.gov/37615780/

Implementation consequences:
- every review/retrieval event records concept/item, evidence type, timestamp, policy version and outcome;
- scheduling parameters are versioned and observable so policy can evolve without rewriting historical learning evidence;
- “harder feeling” retrieval is not interpreted as poorer learning by itself; learner-facing copy explains the purpose of recall/reassessment;
- spacing is concept/evidence-aware and bounded; it must not create notification spam or punitive streak pressure;
- retrieval success is distinct from one-time recognition/multiple-choice exposure;
- interleaving is introduced only where concept boundaries make comparison useful, with experiment/quality metrics rather than blanket mixing;
- mastery decisions require multiple governed evidence types/thresholds defined by curriculum policy, not one flashcard answer or self-report;
- assessment analytics include item-position bias, discrimination/difficulty where sample size is sufficient, and an explicit “insufficient sample” state rather than unstable pseudo-precision.


## Unified Learning Experience Constitution

Academy learning science, assessment, Mentor, Trading Arena, League, scoring, gamification and UI/UX are one behavioral system. A feature is not acceptable merely because it works in isolation; it must reinforce the same learner behaviors and authority boundaries across the product.

### North-star learner outcome

TecPey optimizes for durable, transferable competence: the learner can retrieve important knowledge later, explain why a decision is safe or unsafe, apply concepts in a changed scenario, recognize uncertainty, manage risk and independently choose an appropriate next action. Completion, clicks, time-on-page and raw activity are not substitutes for learning.

### Instructional design contract

Every governed lesson or adaptive mission must define, where applicable:
- explicit learning objective(s), prerequisites and concept tags;
- an accurate mental model before unnecessary complexity;
- worked example(s) and counter-example(s);
- common misconceptions and safety-critical failure modes;
- retrieval practice rather than recognition-only repetition;
- explanatory feedback that addresses why an answer is correct/incorrect;
- transfer/application in a meaningfully changed scenario;
- remediation for weak evidence and reassessment after remediation;
- spaced follow-up governed by a versioned scheduling policy;
- source/provenance metadata for claims that can become stale;
- accessibility, FA/EN semantic parity and cognitive-load-aware presentation.

Difficulty is not a quality metric by itself. Challenge increases only when evidence indicates readiness. The system must avoid both trivial fluency and unnecessary cognitive overload.

### Evidence and mastery contract

Learning evidence must preserve enough context to explain and replay a decision. Governed evidence records include, as applicable:
- tenant/workspace/student scope;
- concept and item identifiers;
- item/content version;
- evidence type: exposure, practice, retrieval, transfer/application, reassessment or reflection;
- source/authority;
- observed timestamp;
- outcome/strength/confidence where valid;
- policy version used to interpret or schedule the evidence.

Rules:
- exposure is not mastery;
- self-report/reflection is useful metacognitive evidence but cannot independently create mastery;
- Mentor output is advisory evidence and cannot independently create mastery, rank, credential or entitlement;
- one correct answer cannot independently establish durable mastery;
- mastery requires governed evidence across the curriculum-defined evidence window and must explicitly support an insufficient-evidence state;
- historical evidence is immutable with respect to the item/content/policy version that produced it;
- recommendation and mastery decisions expose stable reason codes rather than an unexplained universal score.

### Adaptive Infinite Growth contract

Term 8 / Infinite Growth is a recurring learning engine, not a finite eighth content bundle. A bounded cycle follows:

Evidence → Diagnose → Explain → Worked example/Socratic support → Practice → Retrieval → Transfer → Reassess → Remediate/Advance → Schedule next retrieval.

The engine must:
- choose weak, decaying or safety-critical concepts from governed evidence;
- account for evidence recency and strength instead of treating every historical signal equally;
- produce deterministic/replayable recommendations for the same evidence snapshot and policy version;
- explain why each concept/mission was selected;
- fail safely to insufficient evidence rather than fabricate personalization;
- prioritize safety-critical misconceptions where curriculum policy requires it;
- prevent reflection, engagement XP or Mentor suggestions from silently becoming mastery;
- never become permanently completed.

### Scoring-channel separation

TecPey must not collapse learning into one universal points balance. The following channels remain separate authorities:

| Channel | Purpose | May independently create mastery? | May independently create financial/special entitlement? |
| --- | --- | --- | --- |
| Learning XP | motivation, healthy participation, visible progress | No | No |
| Mastery Evidence | verified learning competence | governed input only | No |
| League Score | opt-in seasonal educational competition | No | No |
| Credential | governed verified achievement | No | No |
| Special Opportunity | separately governed scholarship/funded-account/job-like program | No | only through its own explicit authority |

High activity cannot compensate for weak competence, and payment/plan status cannot improve learning rank or mastery.

### League contract

League design rewards learning quality rather than risky market behavior.

Eligible dimensions may include governed assessment accuracy, verified improvement, consistency, remediation completion, journal quality, rule compliance and Arena discipline. Cohort comparison should be used where material differences in learner stage would otherwise make ranking misleading.

Forbidden ranking inputs include:
- real-money P&L or account wealth;
- deposited amount;
- leverage or risk-taking volume;
- raw trade frequency;
- raw speed without correctness;
- paid-plan advantage;
- engagement spam/grinding.

League visibility is opt-in. Scoring must be versioned, explainable and auditable. Anti-gaming controls must prevent repetitive low-value actions from farming rank. A League season reset must not erase the learner's underlying mastery evidence.

### Gamification contract

Gamification exists to support autonomy, competence, safe persistence and meaningful progress—not compulsive engagement.

- XP rewards bounded, useful learning actions and is protected by diminishing returns/caps where repetition can be farmed.
- Streaks must allow recovery/grace and must not punish a learner into unsafe or low-quality activity.
- Progress Core visualizes meaningful growth across distinct channels without pretending they are one score.
- Badges/celebrations are sparse and tied to real milestones.
- Remediation is framed as the normal learning loop, not failure or shame.
- Variable-reward dark patterns, artificial urgency and gambling-like reinforcement are prohibited.
- Notifications optimize useful return-to-learning timing, not maximum opens.

### Trading Arena learning contract

Arena is a transfer laboratory, not a profit leaderboard. Educational evidence may reward:
- position-sizing discipline;
- rule compliance;
- explicit invalidation/risk reasoning;
- journal quality;
- ability to avoid low-quality/no-trade situations;
- correction of previously observed mistakes.

Real P&L, leverage seeking and trading volume cannot create Academy rank or mastery. Simulated P&L may be contextual feedback but cannot dominate educational scoring.

### Mentor contract

Mentor is coach and explainer, not authority. It may:
- explain misconceptions;
- use Socratic prompts;
- select governed worked examples;
- recommend remediation/retrieval;
- explain why a mission was selected;
- summarize governed evidence.

It may not independently certify mastery, alter official assessment history, create League score, issue credentials, grant special opportunities or convert unverified self-report into authoritative evidence.

### UI/UX and visual-language contract

The interface must make the learning model understandable rather than hide it behind gamification.

At every important state the learner should be able to understand:
1. Where am I?
2. What am I learning or repairing?
3. Why was this selected for me?
4. What evidence changed?
5. What is the next useful action?
6. What does this score/progress indicator mean—and what does it not mean?

Visual direction is premium, calm and financial-grade. Avoid childish badge density, casino aesthetics, excessive confetti, leaderboard pressure and glass-on-glass noise. Motion communicates hierarchy/state and honors reduced-motion preferences. Remediation must feel constructive. Mastery moments may feel special, but celebration intensity must not distort learning behavior.

### Cross-system anti-gaming and fairness

- Repeated low-value actions cannot generate unbounded XP or League Score.
- Client-generated state is never sufficient authority for mastery/rank/credential.
- Duplicate/replayed mutations are idempotent or rejected.
- Scoring/recommendation policies are versioned and historical results retain their original policy identity.
- Learners can see meaningful reasons for score/recommendation changes.
- Missing evidence, small samples and degraded upstream signals are represented explicitly rather than converted to false precision.
- FA/EN learners receive semantically equivalent objectives, assessment difficulty and scoring rules.

## Unified acceptance matrix

This PR is not complete merely because CI is green. Before completion, evidence must demonstrate:

1. **Curriculum quality:** audited objectives, distractors, explanations, misconceptions, difficulty and FA/EN parity across Terms 1–7.
2. **Assessment validity controls:** duplicate/answer-position/placeholder validators plus versioned item provenance.
3. **Evidence model:** distinct evidence types, immutable provenance and explicit insufficient-evidence behavior.
4. **Adaptive loop:** a bounded Infinite Growth cycle can be reproduced from the same governed evidence snapshot + policy version and produces reason-coded selections.
5. **Retention:** spaced-review policy is observable/versioned and reassessment can trigger remediation.
6. **Authority:** Mentor, reflection, XP, client state and League cannot independently create mastery/credential/entitlement.
7. **League:** explainable versioned scoring, opt-in visibility, forbidden financial/risk inputs and anti-grinding tests.
8. **Gamification:** bounded XP, non-punitive streak behavior and no universal points authority.
9. **Arena transfer:** educational scoring emphasizes risk discipline and reasoning rather than profit/volume.
10. **UX:** personalized recommendations explain why/next action; loading, insufficient-evidence, degraded and remediation states are designed in FA/EN with accessibility.
11. **Security/fairness:** tenant isolation, idempotency/replay, server authority and negative tests cover new mutations.
12. **Verification:** exact-head TypeScript, lint/correctness authority, unit/integration/security tests, repository audits and browser golden paths all pass after the final implementation commit.

Any intentionally deferred acceptance item must be named, scoped, owner-tagged and linked to a follow-up; silent deferral is not accepted.

## Acceptance
Validators catch duplicates, invalid explanations, answer bias and broken FA/EN parity. Infinite Growth can reproduce a bounded personalized cycle from governed evidence and explicitly handles insufficient evidence.

## Delivery discipline
This Draft PR begins as an implementation contract. Code, migrations, tests and evidence are added to this same branch. It cannot become Ready until every acceptance item is implemented or explicitly split into a named follow-up.

## Release boundary
Opening this PR authorizes no merge, Staging mutation or Production mutation.
