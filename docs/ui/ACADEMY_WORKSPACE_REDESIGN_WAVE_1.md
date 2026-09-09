# Academy workspace — implementation wave 1

Date: 2026-09-07
Baseline: `3a1188a5fa24229bcd45f6094e92414b1f80e1ae`
Status: local implementation; not deployed or visually accepted.

## Implemented

- Dashboard: restrained solid surfaces, fewer nested containers, clearer next-step
  action, high-contrast cyan primary button, isolated bidirectional identifiers.
- Navigation: mentor opens AI Guide; Arena opens its named route; notifications
  are explicitly labelled; term cards link to the term named on the card and
  describe prerequisites. Server progression gates remain unchanged.
- Onboarding: existing profiles are hydrated into an editable form instead of
  immediately redirecting back to the dashboard. No automatic write is issued.
  Saving uses the existing authenticated profile endpoint and its session update.
- Form: associated labels, submit-on-Enter, announced errors and saving state,
  disabled fields during submission, selected avatar semantics and 44px targets.
- Existing goal and avatar are retained rather than replaced by initial defaults.

## Important boundary

This removes the **client redirect loop**, not the underlying login/session
identity problem. Login still issues `studentId: null`; a profile save can attach
the student identity through the existing server flow. This is not a complete
returning-user authentication fix. No client-supplied student ID, access bypass,
automatic grant, new provider, financial operation or database migration was added.

## Verification

- TypeScript: passed.
- Targeted ESLint: passed.
- Profile authority + infinite-growth policy + new source-contract tests:
  14 passed. Three new checks are source contracts, **not browser E2E tests**.
- Frontend style authority: passed.
- Production build: passed again after final refinements, including TypeScript,
  static generation and server bundling.
- Local database is unconfigured. Build completion is not database, tenant,
  session-recovery or provider runtime evidence.
- Mobile/desktop screenshots, keyboard interaction and Safari inspection:
  not yet performed against this new implementation.

## Next acceptance gates

1. Resolve returning-user student identity server-side with verified account
   ownership and tenant binding. Cover fresh login, relogin, refresh, 2FA,
   revocation, missing profile, foreign tenant and storage outage.
2. Verify existing-profile save in staging, including session refresh and return
   to Arena. Confirm goal, avatar, progress and achievements remain intact.
3. Capture FA/EN at 390px, tablet and desktop widths; test 200% text/zoom,
   keyboard-only operation, long names, error states and reduced motion.
4. Reconcile the English Arena introductory route with Persian execution before
   claiming native-quality feature parity.
5. Extend the accepted visual direction to shared navigation, auth, Academy,
   mentor, Arena, profile and settings; include coherent light-mode support.
6. Track subscriptions, content/news automation, providers and admin separately;
   no readiness claim for these domains is made by this patch.

Apple-inspired restraint guides hierarchy and interaction quality; this work
does not assert Apple certification, App Review approval or completed platform
redesign.
