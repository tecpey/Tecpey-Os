# TecPey Academy V3 — Curriculum Rebuild Specification

Status: Phase 1 implementation authority
Date: 2026-09-25
Parent: 09_ACADEMY_V3_LEARNING_OS_PRODUCT_CONSTITUTION.md

## Repository finding

The current unified curriculum is still partly a compatibility adapter over legacy content. Terms 2–7 commonly pass through adaptLegacyLesson(), which generates repeated objective, section, retrieval, flashcard, checklist and reflection structures. This is a useful validation bridge, not the V3 destination. V3 requires concept-specific instructional design, misconceptions, transfer, provenance and assessment.

## Rebuild rule

Do not rewrite all prose in one large change. Rebuild in governed, reviewable slices:

1. Current content inventory.
2. Stable concept graph.
3. Prerequisite graph.
4. Observable objective registry.
5. Safety-critical map.
6. Misconception registry.
7. Source and freshness registry.
8. Assessment item bank.
9. Transfer and decision scenarios.
10. FA/EN semantic parity.
11. Learner experience.

Every current lesson must ultimately map to keep, rewrite, split, merge or retire.

## Stable concept identity

Each durable concept needs a stable ID and version. Historical learning evidence remains bound to the item/content/policy version that produced it. New wording or a changed concept cannot silently reinterpret old evidence.

A concept records its term, localized titles, objective IDs, prerequisite concept IDs, safety criticality, misconceptions, source references and freshness class.

## Objectives

Objectives describe observable capability, not vague understanding. Prefer verbs such as explain, distinguish, identify, calculate, compare, verify, diagnose, justify, choose, reject, apply, construct and evaluate.

Each objective declares which evidence types can support it: retrieval, application, transfer, reassessment or governed Arena evidence.

## Misconception-first design

Important concepts define realistic failure modes. Distractors should normally come from real misconceptions rather than arbitrary wrong statements.

A misconception records a stable ID, reasoning pattern, why it is attractive, why it fails, corrective mental model, safety severity, remediation and reassessment strategy.

## Learning mission

A mission is a coherent learning unit, not a checklist of widgets. It normally combines a concise mental model, worked example, misconception contrast, retrieval, application or decision, explanatory feedback and a next action.

Retrieval should occur throughout learning rather than only at the end of a term. It must remain meaningfully effortful and receive useful feedback.

## Assessment families

V3 should support governed forms beyond recognition-only multiple choice: short retrieval, misconception-based choice, ordering, classification, calculation, evidence selection, scenario decision, confidence judgment, error diagnosis, changed-context transfer and Arena decision evidence.

Automated scoring authority must be explicit. AI evaluation cannot silently become mastery authority.

## Financial decision scenarios

A strong scenario declares context, known evidence, uncertainty, constraints, possible actions including no-action when appropriate, risk consequences, rationale requirements and evidence that would change the decision.

Outcome luck cannot retroactively make poor reasoning correct.

## Provenance and freshness

Durable principles and mutable market, regulatory, security or product claims are different content classes. Mutable claims require source provenance, source/retrieval date, content version and freshness policy. Expired examples cannot remain authoritative merely because they were once correct.

## Proposed macro curriculum

### Term 1 — Foundations and Safe Participation
Money and trust, crypto primitives, blockchain, Bitcoin/Ethereum, stablecoins, custody basics, networks, market vocabulary, uncertainty and foundational safety.

### Term 2 — Security, Custody and Operational Safety
Authentication, recovery, wallet models, phishing/social engineering, malware, approvals, network/memo safety, incident response and operational checklists.

### Term 3 — Market Mechanics and Execution
Exchange mechanics, order types, liquidity/order book, spread/slippage, fees, deposits/withdrawals, execution quality and no-rush discipline.

### Term 4 — Research, Tokenomics and Evidence
Project claims, teams/code/governance, token supply/unlocks, valuation context, liquidity, protocol metrics, source verification, red flags and uncertainty.

### Term 5 — Market Analysis and Invalidation
Price/volume structure, trends/ranges, indicators as tools rather than truth, multi-signal reasoning, invalidation, timeframe/context and limitations.

### Term 6 — Risk, Decision Psychology and Process
Position sizing, expectancy, drawdown, correlation, loss limits, FOMO, revenge behavior, overconfidence, confirmation bias, precommitment and no-trade discipline.

### Term 7 — Integrated Professional Practice
Research workflow, plan construction, journaling, portfolio/risk scenarios, security review, evidence communication, integrated Arena transfer and graduation assessment.

### Term 8 — Infinite Growth
No finite syllabus. Governed adaptive repair, retrieval, transfer, current market/security updates, Arena discipline and Mastery Seasons.

This macro map is a target for inventory reconciliation, not permission to delete existing content blindly.

## Experience consequence

Future term surfaces should prioritize current mission, objective, why it matters, prerequisite state, concept-map position, evidence state, next retrieval, repair need and optional deeper exploration rather than primarily showing a vertical lesson list.

## Gamification consequence

Curriculum is never authored to manufacture XP. Rewards attach only after the learning event model is governed. Routine exposure receives restrained acknowledgement; repaired misconceptions, delayed transfer, demanding seasons and graduation can receive progressively stronger celebration.

## Phase 1 artifacts

Before mass content replacement, create:
- canonical concept map;
- objective registry;
- misconception registry;
- source/freshness registry;
- current-to-V3 content mapping;
- retirement/migration rules;
- FA/EN parity validator;
- safety-critical concept validator.

## Acceptance gate

Phase 1 completes only when every current lesson is classified, every V3 concept has stable identity, prerequisites contain no cycles, safety-critical concepts are explicit, objectives are observable, major misconceptions are authored rather than templated, freshness requirements are known, FA/EN topology is defined and historical evidence cannot be silently reinterpreted.

No merge or deployment is authorized by this specification.
