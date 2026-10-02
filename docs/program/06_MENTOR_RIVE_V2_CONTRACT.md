# Mentor: Rive v2 Data Binding + 20+ semantic state acceptance

**Reconstructed base main:** `96b56d0e469b356ccf8ee698c5a75a36d1cabe60`  
**Dependencies:** Independent implementation track. Mentor Workspace v2 (#703) consumes this contract.  
**Release boundary:** No merge, Staging mutation or Production mutation is authorized by this PR.

## Objective

Evolve the existing static-safe v1 Mentor boundary into a versioned v2 semantic/Data Binding contract while preserving the approved static fallback and without fabricating asset acceptance.

Architecture:

`governed backend/host evidence → host policy/event → semantic presentation state → minimal v2 ViewModel → accepted renderer`

An LLM never selects animation, mood, entitlement, safety state or trading authority directly.

## Quality rules

- authority-sensitive state remains server/host-owned and fail-closed;
- no synthetic mastery, rank, entitlement, consent, market certainty or risk truth is created in the renderer;
- renderer-bound data is an explicit allowlist, not a serialized user/profile object;
- FA/EN, RTL/LTR, reduced-motion, high-contrast and static fallback are contract concerns;
- v1 consumers remain supported during migration;
- no runtime package or `.riv` file is accepted merely because it renders in the Editor;
- activation requires exact asset/runtime evidence, digest binding and independent acceptance.

## Research basis — refreshed 2026-10-02

Primary references used for this implementation:

- Rive Data Binding core concepts / View Models / Instances / custom enums: https://rive.app/blog/getting-started-with-data-binding
- Rive production runtime surface: https://rive.app/features
- WCAG 2.2 Animation from Interactions: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions
- WCAG technique C39 (`prefers-reduced-motion`): https://www.w3.org/WAI/WCAG22/Techniques/css/C39

Implementation consequence: semantic enums are product meaning; animation implementation remains downstream. Reduced motion removes non-essential motion rather than removing meaning.

## Implemented host contract

### Version

`tecpey-mentor-rive-viewmodel.v2` / `2.0.0`

Machine schema:
`docs/mentor/schemas/tecpey-mentor-rive-viewmodel.v2.schema.json`

Engineering contract:
`src/lib/living-mentor-rive-v2.ts`

Detailed design/authority contract:
`docs/mentor/RIVE_VIEWMODEL_CONTRACT_V2.md`

### 29 semantic states

Conversation:
`idle`, `greeting`, `listening`, `thinking`, `explaining`, `next_step`

Learning:
`learning_focus`, `quiz_ready`, `review_due`, `flashcards_due`, `lesson_complete`

Recognition/retry:
`effort_acknowledged`, `milestone_celebration`, `retry_encouragement`, `reflection_pause`

Research/work:
`research_ready`, `researching`, `source_checking`, `research_unavailable`

Arena:
`arena_ready`, `arena_coaching`, `arena_reflection`, `arena_cooldown`

Safety/degraded:
`risk_caution`, `privacy_notice`, `consent_required`, `data_stale`, `data_unavailable`, `runtime_error`

### Required ViewModel fields

The v2 renderer projection includes the requested `userName`, `streakDays`, `mood`, `riskLevel`, `roomLevel`, `locale`, `reducedMotion` and `state`, plus bounded accessibility/known-state fields needed to avoid presenting unknown values as real zeroes.

The projection deliberately excludes credentials, identity documents, email/phone, balances, holdings, PnL, order state, raw profile data, prompts, consent records and authority provenance.

### Deterministic behavior

- named host events map deterministically to semantic states;
- safety/degraded override wins over ordinary presentation intent;
- malformed state/override fails closed to `runtime_error`;
- display name is blank unless the host explicitly allows it;
- unknown streak/room values remain distinguishable from real zero via `streakKnown` / `roomKnown`;
- bounded numeric values are clamped;
- invalid mood/risk enums degrade to `unknown`;
- invalid locale degrades to `fa` and invalid direction to `rtl`;
- `reducedMotion=true` forces `motionIntensity=0`;
- no event derives emotional/risk animation directly from PnL, price, profit or loss.

### v1 migration compatibility

All 29 v2 states have an explicit downgrade to one of the existing 13 `LivingMentorAct` values. That permits #703 and other consumers to adopt host semantic meaning before a v2 asset is activated, without claiming animation capability the current asset does not possess.

## Automated verification added

- `src/tests/mentor/living-mentor-rive-v2.test.ts`
  - schema/state parity;
  - >=20 unique semantic states;
  - exact v1 compatibility;
  - deterministic event mapping;
  - no PnL-derived state event;
  - safety precedence;
  - privacy minimization;
  - unknown-vs-zero semantics;
  - bounds/control-character sanitization;
  - reduced-motion enforcement;
  - malformed runtime fail-closed behavior;
  - forbidden renderer field check.
- `scripts/mentor-rive-v2-contract.test.mjs`
  - source-level no-eager-Rive-runtime invariant;
  - static fallback preservation;
  - closed schema/property allowlist;
  - activation-gate invariants requiring canonical asset and production evidence.

## Existing v1 authority preserved

The existing v1 adapter remains the active renderer-facing authority and retains its stale-speech protection, allowlisted binding projection and safe fallback behavior. `LivingMentorAvatar` remains the static WebP renderer until activation evidence is real.

## Remaining external acceptance blocker

A genuine exported and accepted v2 `.riv` asset is not present. This is intentionally **not** bypassed with a placeholder.

The PR cannot truthfully claim complete renderer activation until the real asset proves:

1. exact asset SHA-256/digest;
2. required v2 ViewModel properties and all required semantic states;
3. accepted artboard/state-machine/ViewModel names;
4. pinned supported web runtime compatibility;
5. static failure fallback;
6. reduced-motion equivalent meaning;
7. FA/EN and RTL/LTR dynamic text in the real asset;
8. representative-device frame/readiness/memory budgets;
9. accessibility/privacy/binding-allowlist evidence;
10. required independent sign-offs.

No runtime dependency and no `.riv` asset are added by the host-contract implementation, so repository activation remains safe static fallback.

## Ready gate

Before this PR can become Ready:

- exact-head TypeScript, ESLint, unit, source-contract, repository/security and browser workflows must be green;
- no unresolved review threads;
- branch must be reconciled to current `main` with no unrelated delta;
- signed v2 asset acceptance must be supplied **or** the PR must remain explicitly Draft with the asset activation item recorded as the only external blocker rather than falsely claimed complete;
- no Staging or Production mutation is used to manufacture evidence.
