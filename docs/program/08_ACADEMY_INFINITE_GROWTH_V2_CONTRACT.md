# Academy: Infinite Growth + assessment quality + adaptive remediation

**Reconciled main authority:** `3901d820a0ce5162fb61704add221183710a0e5f`

**Dependencies:** Existing Academy authority + Mentor evidence; Notifications may consume durable learning events later.

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

## Acceptance
Validators catch duplicates, invalid explanations, answer bias and broken FA/EN parity. Infinite Growth can reproduce a bounded personalized cycle from governed evidence and explicitly handles insufficient evidence.

## Delivery discipline
This Draft PR begins as an implementation contract. Code, migrations, tests and evidence are added to this same branch. It cannot become Ready until every acceptance item is implemented or explicitly split into a named follow-up.

## Release boundary
Opening this PR authorizes no merge, Staging mutation or Production mutation.
