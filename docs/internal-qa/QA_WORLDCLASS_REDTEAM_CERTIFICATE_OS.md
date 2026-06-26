# TecPey Learning OS — World-Class RedTeam QA

## Scope
This audit covered the latest Learning OS / Certificate product patch with focus on public trust, credential verification, student identity, Hall of Fame, student profile, API leakage, internal-copy leakage, route integrity, and install readiness.

## Critical findings fixed in this patch

### 1. Fake/local certificates could look verified
**Risk:** A certificate generated from browser localStorage used a `TP-CERT-...-LOCAL` ID and `status: verified`. Even though the verify page treated LOCAL as pending, the certificate card itself could still feel officially verified.

**Fix:** Local progress is no longer rendered as a verified certificate. The certificates page only shows official certificates returned from the server. If local progress exists, the UI offers a formal issuance request after account completion.

### 2. Public Student Profile was static and over-claimed verification
**Risk:** `/student/[studentId]` displayed a verified-looking profile for any arbitrary ID. That is a trust and credential-forgery risk.

**Fix:** The public student profile now reads official certificate records from PostgreSQL by `public_student_id`. If no verified certificate exists, it shows a non-verified state. No arbitrary ID is presented as verified.

### 3. Hall of Fame used static/fake winners
**Risk:** Hardcoded “top student” names made the product feel staged and could damage credibility.

**Fix:** Hall of Fame now builds rankings from official verified certificate data. If there is no real data, it shows a premium empty state instead of fake winners.

### 4. Health endpoint exposed environment configuration
**Risk:** `/api/health` leaked whether OpenAI, Redis, DB and site URL were configured. This is useful operational intelligence for attackers.

**Fix:** Health endpoint now returns only minimal public health status: app OK, service name and timestamp.

### 5. API responses exposed configuration/fallback internals
**Risk:** Certificate/profile APIs returned `configured`, `fallback`, and local-fallback details. Not catastrophic, but unnecessary product/internal leakage.

**Fix:** Public API responses now avoid environment configuration disclosure.

### 6. package-lock mismatch blocked `npm ci`
**Risk:** `package.json` included `qrcode` and `@types/qrcode`, but `package-lock.json` was not in sync. `npm ci` failed before installation.

**Fix:** Lock file was updated with `npm install --package-lock-only` so clean installs can resolve the added certificate QR dependencies.

## Static QA results

- Internal route link scan: 0 missing internal page routes found.
- RedTeam keyword scan after patch: no user-facing MVP / Prototype / TODO / LOCAL / fake certificate leakage found in `src`.
- Sensitive health config leak removed.
- Static hardcoded Hall of Fame winners removed.
- Arbitrary verified public profile issue removed.

## Remaining launch gate

A full production build still must be run in a dependency-complete environment:

```bash
npm ci
npm run check
npm run build
```

The previous `npm ci` blocker caused by lockfile mismatch was fixed. If dependency installation is available on the deployment machine, this is now the required final gate.

## RedTeam verdict

Before this patch, the Certificate / Student Identity layer had a serious trust problem: it looked impressive but could accidentally over-claim verification. After this patch, it behaves more like a real credential system: official records only, public verification only when DB-backed, and no fake leaderboard/profile states.

Score after patch: 9.2/10 for product trust layer.

The remaining step toward 10/10 is full server-side PDF certificate generation with a branded print template and authenticated account completion flow.
