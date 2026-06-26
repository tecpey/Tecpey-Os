# TecPey Learning OS Certificate Patch QA

## Scope
This patch upgrades TecPey Academy from a course-style experience into a stronger Learning OS identity layer.

## Added Product Features
- TecPey Verified Certificates page in FA/EN.
- Public certificate verification route: `/verify/[certificateId]`.
- QR SVG API for each certificate: `/api/academy-certificates/qr/[certificateId]`.
- Certificate issue/read API: `/api/academy-certificates`.
- PostgreSQL-backed `academy_certificates` table with certificate ID, student ID, public TecPey ID, score, term, status and verification hash.
- Public student profile route: `/student/[studentId]`.
- Academy Hall of Fame in FA/EN.
- Dashboard links to certificates and Hall of Fame.
- Academy landing sections for verified certificates and Hall of Fame.

## Product QA
- Certificate copy avoids profit promises and does not position the document as a trading license.
- QR points to a verification page, not a file download.
- Certificate status is explicit: verified / not verified.
- Empty state is product-grade and invites the user to complete the first term.
- Hall of Fame copy emphasizes learning, discipline and risk awareness instead of financial returns.
- Public profile only exposes learning identity and avoids sensitive personal details.

## Security QA
- Certificate IDs are normalized before QR/verify usage.
- Certificate verification is DB-backed in production.
- Certificate hash uses `CERTIFICATE_SIGNING_SECRET` or server secret.
- APIs are rate-limited through the existing shared rate-limit layer.
- Database table creation is idempotent.

## Build/Syntax QA
- Targeted TypeScript/TSX transpile check passed for all new and modified patch files.
- Full `npm run build` still requires dependency installation; `npm install` could not complete inside the sandbox timeout.

## Required Production ENV
- `DATABASE_URL`
- `CERTIFICATE_SIGNING_SECRET`
- `NEXT_PUBLIC_SITE_URL=https://tecpey.ir`

## Production Commands
```bash
npm install
npm run check
npm run build
```
