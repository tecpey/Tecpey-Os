# TecPey Living Mentor — Rive ViewModel Contract v2

**Contract:** `tecpey-mentor-rive-viewmodel.v2`  
**Version:** `2.0.0`  
**Status:** host contract implemented; runtime activation blocked until signed asset acceptance  
**Machine schema:** `docs/mentor/schemas/tecpey-mentor-rive-viewmodel.v2.schema.json`

## Purpose

v2 separates **product meaning** from **animation implementation**. The host selects a bounded semantic state from governed application evidence; Rive receives only a minimal presentation model. An LLM, prompt, Rive listener or client-controlled value never grants entitlement, mastery, rank, risk authority, consent or trading authority.

The existing v1 snapshot/adapter remains supported while v2 is introduced. Every v2 semantic state has an explicit deterministic downgrade to a valid v1 act, so the migration does not require activating a new `.riv` asset before the signed asset is ready.

## Primary research basis

- Rive Data Binding treats a View Model as the data blueprint and View Model Instances as runtime data; custom enums provide named state values instead of magic numbers: https://rive.app/blog/getting-started-with-data-binding
- Rive web/React runtimes are the supported delivery path for interactive graphics: https://rive.app/features
- WCAG 2.2 Animation from Interactions recommends honoring the platform motion preference and suppressing non-essential motion: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions
- WCAG technique C39 documents `prefers-reduced-motion` as a sufficient technique for preventing non-essential interaction motion: https://www.w3.org/WAI/WCAG22/Techniques/css/C39

Research informs the contract; it does not constitute asset acceptance evidence.

## Trust boundary

```text
server / governed host evidence
        ↓
host policy + presentation event
        ↓
semantic v2 state + safety override
        ↓
minimal Rive v2 ViewModel
        ↓
accepted renderer asset (future)
```

The renderer-facing model intentionally excludes raw profile records, balances, PnL, holdings, order data, credentials, prompts, identity documents, consent records, email/phone, provider secrets and authority provenance. Those remain host-side.

## Renderer-facing properties

| Property | Meaning | Fail-closed behavior |
| --- | --- | --- |
| `contractVersion` | Exact contract version | fixed `2.0.0` |
| `state` | Governed semantic presentation state | invalid → `runtime_error` |
| `userName` | Optional display name only | blank unless host allows display |
| `userNameVisible` | Explicit rendering permission | false unless allowed + non-empty |
| `streakDays` | Bounded display value | `0` when unknown |
| `streakKnown` | Distinguishes real zero from unknown | false when evidence absent/invalid |
| `mood` | Self-reported/policy-approved mood only | `unknown` |
| `riskLevel` | Host-approved presentation risk band | `unknown` |
| `roomLevel` | Bounded room progression display | `0` when unknown |
| `roomKnown` | Distinguishes real zero from unknown | false when evidence absent/invalid |
| `locale` | BCP-47-like bounded locale tag | `fa` |
| `direction` | `rtl` / `ltr` | `rtl` |
| `reducedMotion` | Device/product motion preference | boolean |
| `highContrast` | Host accessibility preference | boolean |
| `motionIntensity` | 0–1 presentation intensity | clamped; forced `0` under reduced motion |

## Semantic states

### Conversation
`idle`, `greeting`, `listening`, `thinking`, `explaining`, `next_step`

### Learning
`learning_focus`, `quiz_ready`, `review_due`, `flashcards_due`, `lesson_complete`

### Recognition / retry
`effort_acknowledged`, `milestone_celebration`, `retry_encouragement`, `reflection_pause`

### Research / work
`research_ready`, `researching`, `source_checking`, `research_unavailable`

### Arena coaching
`arena_ready`, `arena_coaching`, `arena_reflection`, `arena_cooldown`

### Safety / degraded
`risk_caution`, `privacy_notice`, `consent_required`, `data_stale`, `data_unavailable`, `runtime_error`

There are 29 host-owned semantic states. No event is derived directly from PnL, profit/loss, asset price, or an LLM-selected emotion.

## Deterministic event model

The host reducer maps named product events to semantic states. Examples:

- `request_started` → `thinking`
- `response_streaming` → `explaining`
- `lesson_completed` → `lesson_complete`
- `research_started` → `researching`
- `sources_checking` → `source_checking`
- `arena_coaching_started` → `arena_coaching`
- `risk_review_required` → `risk_caution`
- `privacy_boundary_reached` → `privacy_notice`
- `runtime_failed` → `runtime_error`

Safety/degraded overrides win over ordinary presentation intent. Malformed runtime state or malformed safety override fails closed to `runtime_error`.

## v1 compatibility

Every v2 state maps to one of the existing signed-safe v1 acts. Examples:

- `researching` / `source_checking` → `think`
- `arena_coaching` → `explain`
- `milestone_celebration` → `celebrate_effort`
- `review_due` / `arena_reflection` → `pause_reflect`
- `consent_required` → `privacy_notice`
- `data_stale` → `data_unavailable`
- `runtime_error` → `error_recover`

This compatibility mapping is test-enforced and is not permission to claim v2 animation support from the current asset.

## Motion and accessibility

`reducedMotion=true` forces `motionIntensity=0` at the host boundary. The future accepted asset must render equivalent meaning using a static pose, instant state switch or non-motion treatment. Essential information must remain present in host text/semantics; the character is decorative unless an accessible host equivalent is provided.

Reduced motion is a rendering constraint, not a separate product state. High-contrast rendering is likewise an accessibility input, not authority for learning or risk decisions.

## Asset activation gate

This PR deliberately does **not** add a Rive runtime package or a `.riv` file. Current static fallback remains authoritative until a real asset passes acceptance. Production activation requires, at minimum:

1. one canonical exported `.riv` asset;
2. asset SHA-256/digest bound to acceptance evidence;
3. exact ViewModel/property/state compatibility with this schema;
4. accepted artboard and state-machine names;
5. pinned supported web runtime and runtime compatibility proof;
6. reduced-motion/static fallback proof;
7. FA/EN and RTL/LTR dynamic-text proof in the real asset;
8. representative-device performance and repeated mount/unmount memory evidence;
9. accessibility, privacy and binding-allowlist evidence;
10. independent sign-off required by the existing Mentor Rive acceptance governance.

Until those exist, activation remains fail-closed and `LivingMentorAvatar` continues using the approved static fallback.

## Verification

Host contract tests must prove:

- schema/state parity and 20+ states;
- complete v2 → v1 compatibility;
- deterministic event mapping;
- safety override precedence;
- privacy minimization and explicit display-name permission;
- unknown-vs-zero distinction for bounded progress values;
- runtime enum validation and fail-closed behavior;
- reduced-motion intensity suppression;
- no forbidden sensitive renderer fields.

Browser/runtime visual evidence is intentionally not claimed until the accepted v2 asset exists.
