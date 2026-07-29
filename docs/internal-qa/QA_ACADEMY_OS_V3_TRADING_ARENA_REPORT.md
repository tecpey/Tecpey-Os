# TecPey Academy OS V3 + Trading Arena Patch QA

## Scope
- Rebuilt academy entry flow around Academy Profile before terms, mentor, simulator and Smart Center.
- Added display-name / username / avatar identity model while keeping TecPey ID as internal certificate/audit identity.
- Added Academy Onboarding page: `/academy/onboarding` and `/en/academy/onboarding`.
- Updated Header Smart Center gate: visible as active only after academy profile exists; otherwise prompts to create academy profile.
- Updated Global AI Mentor gate: if profile is missing, mentor explains profile requirement and links to onboarding.
- Updated TermAccessGuard: no term access, including Term 1, before Academy Profile is created.
- Replaced simulator page with Trading Arena Pro experience: advanced TradingView-style chart, demo wallet, practice order panel, risk %, emotion, reason, risk plan, order book, journal and mentor supervision.

## Key QA decisions
- TecPey ID is no longer treated as the visible user identity. Display name and username are user-facing; TecPey ID stays internal / certificate-facing.
- Academy profile can fall back to local device profile for local testing when DATABASE_URL is not configured, so Mac testing does not dead-end.
- Trading Arena stores a local journal and also attempts server sync through `/api/academy-simulator-decision`.
- Mentor and simulator are gated behind Academy Profile to preserve correct user journey.

## Static tests
- `node scripts/qa-route-check.mjs` passed.
- `node scripts/qa-production-static.mjs` passed.
- Full TypeScript/build could not be completed in this sandbox because dependencies were not installed in this extracted workspace.

## Manual QA checklist for Mannan
1. Open `/academy` as visitor: Smart Center must not be active unless logged in + academy profile exists.
2. Click academy CTA: should go to `/academy/onboarding`.
3. Create display name + username + avatar.
4. Confirm redirect to `/academy/profile` and greeting uses chosen display name.
5. Click mentor: if profile exists, chat opens; if profile missing, gate message appears.
6. Open `/academy/term-1`: without profile, onboarding gate appears; after profile, term page opens.
7. Open `/academy/simulator`: without profile, onboarding gate appears; after profile, Trading Arena opens with chart/order/journal.
8. Submit a practice order: it must require reason and risk plan, then add to journal and show mentor review.
