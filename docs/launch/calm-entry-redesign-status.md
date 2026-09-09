# Landing and Academy entry redesign

## Implemented locally

- Shared Persian/English hero with two primary learning destinations.
- Academy login/signup use a shorter introduction, readable form fields and a
  disclosure for unavailable social sign-in. Authentication APIs, OTP, 2FA,
  field order and redirect resolution remain unchanged.
- Compact mentor and learning sections replace the rotating demonstration and
  sample learner progress on both landing pages. Non-landing consumers retain
  their existing full variants.
- Extended legacy landing content remains available under a native disclosure;
  existing content, internal links and anchor IDs are retained.
- Shared risk notice, native FAQ disclosures and account creation/sign-in
  destinations close the primary landing journey.
- No additional packages, fonts, provider activation or database changes.

## Verification boundary

### Local checks on 2026-09-09

- `npm run build`: exit 0, including Next.js production compilation,
  TypeScript, page generation and server bundles.
- The build logged missing/placeholder `DATABASE_URL`. This is not a
  database-backed runtime verification or a deployable environment check.
- `npm run ui:check` and `npm run ui:public:check`: passed.
- Ten entry/locale source tests and one Academy credential authority test:
  passed.
- Golden Path browser expectations now target the shared hero's current
  copy and explicitly open the full guide by keyboard before inspecting its
  retained Arena section. Syntax checked; browser execution still pending.

Source/type checks are not visual acceptance or end-to-end authentication proof.
The previous browser attempt to reach the local preview was blocked with
`ERR_BLOCKED_BY_CLIENT`. Local HTTP checks also did not return an HTTP response.
Do not publish a claim that browser QA, Lighthouse or production build passed
based solely on the source tests.

Before merging and staging, verify the complete change on an authorized preview:

1. Persian and English at 390px, 768px and 1440px, in both themes.
2. Keyboard focus, native disclosures, 200% text zoom and reduced motion.
3. Landing destinations and direct links to retained legacy section anchors.
4. Login/signup errors, password visibility, SMS verification and 2FA with
   dedicated test fixtures; do not submit real account changes without approval.
5. Footer/bottom-navigation overlap and safe-area spacing on mobile.
6. Production build, repository CI and a screenshot comparison before promotion.

No merge, push or deployment is recorded by this document.
