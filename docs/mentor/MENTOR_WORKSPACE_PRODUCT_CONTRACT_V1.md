# TecPey Mentor Workspace — Product Contract v1

**Status:** implementation baseline; extended by `MENTOR_STAGE_DIRECTOR_V2.md`
**Contract version:** `1.0.0`
**Runtime authority:** `src/lib/mentor-workspace.ts`

## Product decision

The dedicated AI Mentor tab is a personal workspace rather than a generic chat
page. The room provides presence, state explanation and visible progression;
the conversation remains the primary job and receives the larger surface.

The character is a respectful fictional mentor inspired by Mahdi. The office,
awards and credentials must never suggest that Mahdi is being simulated or has
returned. The character renderer receives only the governed visual contract,
not identity documents, learning records, private financial data or raw chat
history.

## Adaptive layout

| Viewport | Office | Conversation and history | Monitor behavior |
|---|---|---|---|
| Desktop ≥ 1180 px | Fixed physical left third | Right two thirds; history rail + conversation | Free: one monitor; Premium: three monitors |
| Tablet 721–1179 px | Wide live-scene card above chat | Full-width conversation; history opens as an accessible sheet | One active monitor with surface switcher |
| Mobile ≤ 720 px | Compact live-scene card above chat | Full-width chat; history sheet with focus containment and Escape close | One active monitor with 44 px switch targets |

The office stays physically on the left on desktop in both RTL and LTR. Text,
reading order and controls follow the BCP-47 locale direction. The current copy
catalog contains Persian and English; unknown locales safely use English copy
while preserving their resolved text direction until a native translation is
approved.

Trading Arena is governed by the V2 Stage Director. It appears as a physical
right-side third only at 1440 px and above; smaller viewports use an accessible
drawer or full-screen sheet. The real execution bundle is lazy-loaded only
after an explicit user focus action.

## Plan contract

| Capability | Free | Premium |
|---|---:|---:|
| Safety, risk framing and answer evaluation | Equal | Equal |
| Academy mentor surface | Yes | Yes |
| Visible monitors on desktop | 1 | 3 |
| Source-backed public web research | Locked | Yes |
| Public social/X research | Locked | Yes |
| Ads | Eligible, clearly labelled when implemented | None |
| Mobile presentation | Single switchable monitor | Single switchable monitor |

Premium routing is capability-based rather than model-name-based. TecPey may
route social research to the strongest approved social model and web research
to the strongest approved research model without redesigning the room or
hard-coding a provider into the UI. The server entitlement remains the final
authority; hiding a monitor in the client is never sufficient authorization.

## Office progression

- Credential frames may display only verified Academy achievements or issued
  certificates. Empty frames remain visibly empty; the UI must not invent a
  credential.
- Trophy and medal states derive from server-owned progression milestones.
- Legal identity and certificate/KYC records remain separate from the public
  profile and from the Rive scene.
- The scene exposes one semantic surface slot, `MentorScene`, so the phase-1
  static fallback can later be replaced by the signed Rive component without
  changing page callers.

## Interaction states

| State | Character purpose | Monitor purpose | Motion rule |
|---|---|---|---|
| Idle | attentive presence | current capability | static |
| Listening | acknowledge composed input | retain context | very small pose change only |
| Thinking | explain request processing | Academy context | status-only movement |
| Researching | turn attention to sources | source scan | bounded scan indicator |
| Explaining | return attention to user | answer context | brief, interruptible response |
| Risk caution | calm caution, never alarm theatre | risk checklist | no PnL or market-data animation |

Motion is state explanation, not decoration. Frequently used chat navigation
and keyboard submission do not animate. Scene transforms and scanning stop
under `prefers-reduced-motion`; readable state labels remain.

## Research privacy boundary

Public research egress contains only the current public query. It does not send:

- conversation history;
- learning profile or weak areas;
- financial account or Arena records;
- identity documents, KYC fields or legal certificate data.

Sensitive-looking or instruction-shaped content remains subject to the existing
server trust boundary. A response without acceptable public sources must not be
presented as verified live research.

## Acceptance gates

1. Desktop visual QA at 1440 and 1024 widths.
2. Tablet and mobile QA at 768 and 375 widths, including real-device keyboard
   and safe-area behavior.
3. Full keyboard traversal, visible focus, History Sheet focus containment and
   Escape close.
4. RTL and LTR parity with no Persian copy on the English route.
5. Reduced-motion and high-contrast checks.
6. Server-side plan entitlement before enabling Premium research in production.
7. Signed Rive acceptance evidence before replacing the static character
   fallback.
