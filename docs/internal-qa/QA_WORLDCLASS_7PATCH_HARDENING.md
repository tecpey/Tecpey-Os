# TecPey World-Class 7-Patch Hardening QA

## Applied patches
1. Removed stale static `public/robots.txt` and `public/sitemap.xml`; `src/app/robots.ts` and `src/app/sitemap.ts` are now the single SEO source of truth.
2. Fixed certificate score source: certificate score now uses verified `percent` from `academy_term_progress`, not raw question count.
3. Hardened term quizzes: answer keys are no longer passed to the client quiz component; official scoring is performed by `/api/academy-term-progress` using server-side academy data.
4. Hardened student cartax trust boundary: progress, XP, badges, mentor snapshot and simulator snapshot are derived from verified server records, not user-submitted body fields.
5. Removed legacy `tecpey_academy_lead` client cookie creation; account/session state should rely on signed academy session.
6. Moved root QA/changelog reports into `docs/internal-qa/` to keep the production project root clean.
7. Cleaned `llms.txt` contact duplication and updated static QA script to validate dynamic robots/sitemap architecture.

## RedTeam notes
- Certificate issuance still requires `CERTIFICATE_SIGNING_SECRET` and a passed term in DB.
- Term unlock depends on DB-backed `academy_term_progress` status.
- Client localStorage may still be used only for interface continuity, never as authority for certificates, Hall of Fame, eligibility or official ranking.
- Full production validation still requires `npm ci`, environment variables, `npm run check`, and `npm run build` on the deployment machine.
