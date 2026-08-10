# TecPey Source Code Ownership and Controlled Delivery Policy

**Status:** Official  
**Owner:** TechnoPardakht executive authority  
**Scope:** TecPey source code, deployment bundles, support handoffs, white-label delivery, brand assets, proprietary content, private strategy documents, and production credentials.

## Decision

TecPey is proprietary software. Public repository visibility, support access, or
white-label delivery does not grant ownership, resale rights, source
redistribution rights, reverse-engineering rights, or permission to operate an
unlicensed TecPey derivative.

The default delivery model is controlled artifact delivery:

1. production and customer deployments should use immutable container images,
   signed release digests, environment templates, runbooks, and non-secret
   evidence;
2. full source bundles are emergency or staging exceptions only;
3. any source bundle requires explicit executive approval, release SHA trace,
   bundle manifest, detached SHA-256, proprietary notice, and recipient
   accountability;
4. white-label customers receive licensed platform access, not ownership of
   TecPey source code or the right to resell the platform.

## Ownership Invariants

| Area | Rule |
| --- | --- |
| Source code | Copyright and proprietary license remain with TechnoPardakht. |
| Brand assets | TecPey, تک پی, TP mark, lockups, icons, screenshots, and generated brand derivatives remain governed assets. |
| AI logic | Mentor AI, Trading DNA, scoring, prompts, memory policy, model routing, and governance remain proprietary TecPey IP. |
| Academy/Arena content | Curriculum, assessments, scenarios, trading journal logic, certificates, and progression rules remain proprietary content. |
| Exchange/risk logic | Order admission, custody policy, withdrawal authority, reconciliation, and risk rules remain controlled implementation details. |
| White-label tenant config | Tenant branding and customer content belong to the tenant where contractually agreed; TecPey platform code remains TechnoPardakht IP. |
| Credentials/data | Secrets, private keys, database dumps, production logs with PII, and real customer data are never delivery artifacts. |

## Delivery Tier Matrix

| Tier | Who Receives It | Allowed Contents | Forbidden Contents | Approval |
| --- | --- | --- | --- | --- |
| Hosted SaaS | End users and white-label tenants | TecPey-hosted access, domain config, tenant branding, invoices, usage reports | Source code, production credentials, database dumps | Commercial agreement |
| Managed dedicated cloud | Enterprise tenant | Immutable image digest, runbooks, tenant config, health evidence | Source code by default, private strategy docs, secrets | Enterprise contract and release owner approval |
| Support staging candidate | Trusted support team | Candidate zip only when exception-approved, `.env.production.example`, runbooks, manifest, sha256 | `.env.production`, tokens, dumps, private keys, unapproved internal docs | Executive source-bundle exception |
| On-premise enterprise | Regulated tenant | Hardened artifact package, license key, installation runbook, monitoring evidence | Full source unless separately priced and contracted | On-premise contract, legal review, security review |
| Developer/contributor access | Authorized maintainers | Repository access required for assigned work | Exporting, mirroring, resale, uncontrolled forks | NDA or contributor agreement |

## Source Bundle Exception Requirements

A source bundle may be created only when all conditions are true:

1. the recipient is identified by legal name, organization, contact, and support
   role;
2. the recipient has a signed NDA, support agreement, employment agreement, or
   equivalent written confidentiality obligation;
3. the bundle is generated from a clean, reviewed release SHA;
4. `TECPEY_SOURCE_BUNDLE_EXCEPTION_APPROVED=1` is intentionally set by the
   release owner during packaging;
5. the manifest states that the archive is a proprietary source bundle
   exception, not a resale or ownership transfer;
6. the detached SHA-256 and release SHA are recorded in the handoff log;
7. the recipient returns only non-secret installation evidence;
8. the exception is time-limited and must not become the default deployment
   model.

## White-Label Boundary

White-label means a licensed tenant experience under a customer brand. It does
not mean:

- transfer of TecPey source ownership;
- permission to fork, resell, sublicense, or operate a competing TecPey clone;
- access to Mentor AI internals, Trading DNA rules, custody/risk internals, or
  proprietary Academy/Arena logic beyond the licensed product surface;
- permission to remove TecPey proprietary notices from code, artifacts,
  manifests, runbooks, or internal evidence.

The long-term protected architecture should move high-value commercial logic
behind one or more controlled boundaries:

- private packages or private repositories for proprietary engines;
- remote TecPey services for licensing, entitlement, AI governance, and
  sensitive scoring;
- signed container images and SBOM/provenance evidence for deployable releases;
- tenant-scoped license keys bound to domain, feature plan, term, and allowed
  deployment model.

## Public Repository Rules

Because the repository may be public for operational reasons, every commit must
be public-safe:

- no real secrets, tokens, private keys, wallet keys, database dumps, PII, or
  production logs;
- no private customer contracts or pricing concessions;
- no unreviewed internal strategy that would materially weaken TecPey's
  commercial position if copied;
- no raw source handoff archive committed to the repository;
- no third-party asset without clear usage rights;
- no fake secret that resembles a real credential unless it is explicitly
  covered by the secret-scanning baseline.

## Required Guards

The following checks protect this policy:

- `npm run security:secrets:check`
- `npm run test:secret-scanning`
- `npm run ui:public:check`
- `npm run ip:ownership:check`
- `npm run support:bundle:verify -- <zip> <zip.sha256>`

Any PR that changes deployment packaging, license text, brand authority,
white-label delivery, support handoff, or public repository exposure must update
this policy or explicitly state why no policy change is required.

## Immediate Prohibitions

Do not send or upload:

- `.env`, `.env.local`, `.env.production`, `.pem`, `.key`, wallet seed phrases,
  HSM/MPC credentials, database URLs, Redis passwords, API tokens, or private
  GitHub credentials;
- PostgreSQL/Redis/database dumps or backups;
- raw customer data, KYC data, support screenshots with secrets, or logs with
  PII;
- unverified source bundles;
- source bundles generated without the explicit exception variable;
- bundle links in public PR comments, issues, or chats.

## Handoff Notice

Every support handoff must include this notice:

> This TecPey package is proprietary and confidential. Access is granted only
> for the approved installation or verification task. No ownership, resale,
> sublicensing, redistribution, reverse-engineering, or competing use is granted.
> All rights remain with TechnoPardakht.

## Change Procedure

Changes to this policy require:

1. executive approval;
2. security review;
3. update to the support handoff docs when delivery behavior changes;
4. update to `scripts/check-source-ownership-authority.mjs` when a new invariant
   must be enforced;
5. green CI before merge.
