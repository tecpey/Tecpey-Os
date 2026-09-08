# Connected experience delivery record — 8 September 2026

Source: Mannan's approved mobile review following staging deployment of
`280f381f45333cd47f46dd6a30050a520ea6e1ef`. This is the acceptance backlog;
implementation does not imply validation, merge or deployment.

| Requirement | Implementation / remaining acceptance |
| --- | --- |
| Bottom navigation across public and Academy pages | Shared root shell, Home centered, most-specific active route; verify FA/EN, small screens and safe areas. Command Center retains its own navigation. |
| Clean Mentor empty state | Remove oversized introductory card, suggestions and public research controls on widget and full page; retain a short welcome and real conversation controls. |
| Smaller Telegram support | Icon-only 44px target, visually smaller than the 50–54px send action; accessible name retained. |
| Pro option | Account destination with truthful availability. Paid entitlement, pricing, checkout, renewal and cancellation are still pending; no client-side premium unlock. |
| History and new conversation | Existing server endpoints retained; visible widget errors and protection against switching during responses. Verify persistence, reload, failures and isolation between threads. |
| Authenticated header | Account identity and notification destination across pages; verify logged-out, profile-unavailable and long-name states. |
| Account settings and verification | Independent account hub with profile, notifications and progress links. Password/2FA/session controls and financial KYC integration still pending. Never imply learning identity is financial verification. |
| Horizontal lessons | Accessible lesson carousel for FA/EN with native horizontal scrolling and explicit controls. Verify anchor navigation and completion controls. |
| Academy-wide score bar | Shared bar consumes official progress/state endpoints and refresh events; verify updates after exams and loading/error states. |
| More challenging examinations | Pending: question difficulty, scoring rules, recorded attempts, feedback and anti-repeat scoring review. |
| End-of-term progression | Pending: pass/fail/retry, prerequisites and next-term entry; verify all seven core terms. |
| Term 8 daily challenges | Next phase: unique specialist questions, daily rotation, eligibility, persisted points and deduplication. |
| League and ranking | Next phase: real leaderboard, user's rank, season boundaries, ties and transparent scoring details. |
| News API reconnection | Final phase: provider/configuration discovery, ingestion scheduling, published freshness, failure recovery and admin operations. |

## Broader requirements retained

Apple-inspired accessibility, restrained motion, coherent typography and mobile
layouts; native-quality localization; consistent navigation and content across
Academy, account, Arena, mentor and public pages; animated mentor and notifications;
subscription lifecycle; news/content/social automation and provider administration.
These remain product goals, not a claim of Apple certification or completion.

## Release boundary

Only staging is authorized for this delivery. Existing exchange activation remains
unchanged. Production promotion is outside this release. Financial verification,
billing, points and league position must come from server authority, never from
invented UI values. Changes require checks and a reviewable PR before merge.

## Existing staging verification

User-provided deployment log and independent health check confirmed the deployed
commit above, current schema (102 migrations), database/Redis readiness and active
service. The approved test profile save returned to the dashboard with the existing
name and username. This does not yet verify the new UI changes in this branch.

The saved test profile subsequently entered Arena successfully. Arena reported no
valid server price, so price-dependent commands remained blocked. Price-provider
readiness is an additional acceptance item; it is not a successful trade test.

## PR #617 browser regression follow-up

The first exact-head browser run found insufficient contrast in dark-mode primary
actions and overlapping English landing CTAs after introducing global navigation.
The follow-up gives white CTA labels a contrast-safe action background, stacks
landing actions above navigation, reserves footer clearance, and aligns both mentor
launchers with that stack. A new browser test checks centered Home, route selection,
and CTA geometry. No accessibility exclusion or threshold relaxation was added.
The persistent header refreshes identity on mount, focus and existing auth/profile
events instead of refetching both endpoints on every route transition.
