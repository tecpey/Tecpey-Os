# TecPey Mentor Stage Director V2

**Status:** implemented product contract
**Contract version:** `2.0.0`
**Runtime authority:** `src/lib/mentor-stage-director.ts`

## Executive decision

The Mentor Workspace is not a decorative room and the character is not an
LLM-controlled avatar. It is a governed stage with three independent product
zones:

1. the Mentor office explains presence, capability and verified progression;
2. conversation remains the primary job surface;
3. Trading Arena appears only for an explicit practice task and remains a real,
   authenticated, server-authoritative execution surface.

The language model may write the explanation. It cannot select panel size,
open Arena, set visual severity, celebrate outcomes, choose a pose, or classify
unverified news as critical. Those decisions belong to the deterministic Stage
Director.

## Spatial contract

Physical space remains stable across RTL and LTR: office on the physical left,
conversation in the middle/right, Arena on the physical right. Text direction
inside each zone follows the BCP-47 locale.

| Width | Default | Arena docked | Arena focus |
|---|---|---|---|
| ≥1440 px | office 1/3 + conversation 2/3 | office 24% + chat 42% + Arena 34% | office 18% + chat 24% + Arena 58% |
| 1024–1439 px | office + chat product layout | right-side governed drawer, max 680 px | near-full viewport dialog |
| 721–1023 px | compact office above chat | full-height right sheet | full viewport sheet |
| ≤720 px | compact live scene above chat | full viewport sheet | full viewport sheet; sticky controls and safe areas |

The three-column layout is intentionally withheld below 1440 px. Compressing
three high-information surfaces at laptop widths fails readability, keyboard
navigation and operational trust.

## Arena panel state machine

| State | Entry authority | Runtime cost | Exit |
|---|---|---|---|
| `closed` | default | no Arena bundle and no Arena request | explicit challenge action |
| `docked` | explicit user acceptance | lightweight challenge brief only | focus, minimize or close |
| `focus` | explicit user focus action | lazy-loads authenticated server Arena | dock, minimize or close |
| `minimized` | explicit user action | persistent compact return control | restore |

Arena never opens from LLM copy, sentiment, keyword matching, market movement,
or plan tier. Premium expands capacity, not safety authority. When the execution
UI lacks approved parity for the active locale, embedded execution fails closed
with localized explanation instead of switching the user into Persian.

## Stage dimensions

The Stage Director composes meaning rather than multiplying animation states:

| Dimension | Values |
|---|---|
| Mode | `conversation`, `research`, `challenge_invite`, `arena_coach`, `news_briefing` |
| Framing | `wide_office`, `conversation`, `arena_focus` |
| Pose | `seated_work`, `seated_turn`, `standing_user`, `standing_arena` |
| Gaze | `monitor`, `user`, `arena`, `news` |
| Semantic act | governed 13-act Living Mentor vocabulary |
| Intensity | `calm`, `important`, `critical` |
| Motion delivery | `full`, `reduced` |

This composition prevents a fragile state machine with one bespoke animation
for every product sentence. Rive may redesign the visual implementation later
without changing event semantics or backend contracts.

## Scenario policy

| Product event | Mode / pose / gaze | Semantic act | Intensity |
|---|---|---|---|
| composing a question | conversation / standing-user / user | listen | calm |
| mentor processing | conversation / seated-work / monitor | think | calm |
| public research | research / seated-work / monitor | think | important |
| response ready | conversation / standing-user / user | explain | calm |
| between established conversation turns | conversation / standing-user / user | attentive idle | calm |
| Arena accepted | Arena coach / standing-Arena / Arena | invite next step | important |
| Arena focused | Arena coach / standing-Arena / Arena | explain | important |
| educational risk review | conversation or Arena / relevant pose | risk caution | important |
| confirmed rule breach | Arena coach / standing-Arena / Arena | risk caution | critical |
| news requested | news briefing / standing-user / news | think | calm |
| verified high-impact news | news briefing / standing-user / news | explain | critical but non-theatrical |
| unverified high-impact news | news briefing / standing-user / news | pause and reflect | important, never critical |
| unavailable evidence | conversation / seated-turn / user | data unavailable | important |

`critical` means firm hierarchy and explicit risk wording. It does not authorize
red flashing, urgency loops, FOMO copy, alarm sounds, profit celebration or
dramatic body motion.

## News evidence gate

News presentation requires two separate inputs: `impact` and `evidence`.
Impact alone can never escalate unverified content to the critical stage. The
UI must preserve source title, publisher, publication time and evidence status.
If current sources are unavailable, the product says so instead of producing a
synthetic “daily news” performance.

## Rive ViewModel extension

The eventual signed Rive scene consumes semantic properties only:

```json
{
  "workspaceMode": "arena_coach",
  "sceneFraming": "arena_focus",
  "spatialPose": "standing_arena",
  "gazeTarget": "arena",
  "mentorAct": "risk_caution",
  "intensity": "important",
  "reducedMotion": false,
  "arenaPanel": "focus"
}
```

It does not receive raw chat history, identity documents, KYC fields, financial
account data or learning weaknesses. The identity-critical nose silhouette and
facial proportions are immutable across meshes, weights, responsive layouts and
lip-sync.

## Accessibility and motion acceptance

- All primary controls are at least 44 px.
- Overlay Arena traps focus, closes with Escape and restores focus to the Arena
  trigger.
- Mobile locks background scrolling while the governed sheet is open.
- Frequent typing, keyboard submission and history navigation do not create
  spatial animation.
- Drawer motion is transform/opacity only, bounded to 280 ms and disabled under
  `prefers-reduced-motion`.
- Status remains readable without motion, color or sound.

## Implementation map

- Policy: `src/lib/mentor-stage-director.ts`
- Policy tests: `src/tests/mentor/mentor-stage-director.test.ts`
- Arena shell: `src/components/mentor/MentorArenaDock.tsx`
- Office stage: `src/components/mentor/MentorOfficeScene.tsx`
- Product orchestration: `src/components/academy/AiMentorExperience.tsx`

## Release gates

1. Policy, type, lint and production build pass.
2. 375, 768, 1024 and 1440 px visual QA passes in Persian and English.
3. Real-device soft keyboard, safe-area and focus-return tests pass.
4. Server plan authority is wired before Premium research is enabled.
5. English and later locale execution packs pass content and safety parity
   before embedded Arena activation.
6. Signed Rive identity, rig, motion, performance and reduced-motion evidence
   passes before the static fallback is replaced.
