# Academy identity selection — wave 3

2026-09-07. Local patch; not deployed. This is a prerequisite for repairing
student identity across password login, 2FA and refresh, not that repair itself.

## Changes

- Profile writes take email from the authenticated session and phone from the
  verified account record. Form fields cannot assert email, phone or OAuth
  subjects. Presentation fields remain editable.
- A signed student ID takes precedence for both reads and writes; no fallback
  to an unrelated email or username is allowed when that ID is present.
- Username is no longer an identity lookup key. A duplicate username is rejected
  by the existing unique constraint and receives a useful 409 response.
- Multiple matching identities, or a missing explicitly identified student,
  stop before the first write. Ambiguous profile reads also fail closed.
- Profile write authority outage returns 503, not a false logout.
- The form distinguishes username conflicts from account-link review and keeps
  its entered values for correction.

## Evidence and limits

- 20 targeted unit/source-contract tests passed; six are new identity-selection
  tests. They verify query construction and control flow, not database execution.
- Targeted ESLint and the Academy authority guard passed.
- Added PostgreSQL regression scenario for signed-ID precedence, conflicting
  email/phone identities, missing student and duplicate-username rejection with
  the other profile unchanged. The suite uses transaction rollback.
- All five PostgreSQL cases in that suite were skipped because DATABASE_URL is
  absent here. PostgreSQL acceptance remains required before release.
- Production build completed successfully, including TypeScript and server
  bundling. This does not substitute for the skipped PostgreSQL tests.
- No migration, session revocation, automatic account merge, new binding,
  provider change or production action was performed.

## Still required

Validate the patch on an isolated migrated PostgreSQL database, including API
requests carrying conflicting form identifiers and tenant-host isolation.
Review account-to-student ownership before populating the student claim in all
three session issuance paths. Existing sessions and historic identity data need
separate review; this patch does not retroactively certify their ownership.
