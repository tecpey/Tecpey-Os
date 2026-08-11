# Controlled Soft Launch RC Evidence Packet - 2026-08-10

**Packet status:** HISTORICAL DRAFT evidence packet, not current candidate and not final Go approval
**Decision:** NO-GO until accepted operational evidence is attached
**Historical release candidate SHA:** `03e77790630dac737a2d4cc4636b97e80de48ab3`
**Current candidate source of truth:** `docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md`
**Candidate source:** `origin/main` after PRs #353, #354, #355, #356 and #357
**Evidence packet JSON:** `docs/launch/generated/controlled-soft-launch-rc-evidence-packet-20260810.json`

This packet originally locked a draft candidate around release evidence, not brand
iteration. It has since been superseded for new evidence collection by
`docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md`. It records the exact SHA,
generated packet output, deployment bundle digest, focused local gate results and
the remaining evidence that must be accepted before any controlled Soft Launch Go
decision.

## Candidate Identity

| Field | Value |
|---|---|
| Candidate SHA | `03e77790630dac737a2d4cc4636b97e80de48ab3` |
| Candidate branch at source | `origin/main` |
| Local evidence branch | `agent/controlled-soft-launch-rc-evidence-packet` |
| Main sync status | Local `main` fast-forwarded from `138a1396e2a7810812549678d66c923693e2d276` to `03e77790630dac737a2d4cc4636b97e80de48ab3`. |
| Included upstream PRs | #353 growth governance, #354 brand asset lock, #355 browser persistence guard, #356 runtime lockup hash guard, #357 runtime WebP lockup bytes guard. |
| Candidate packet mode | `historical_draft_incomplete_evidence_superseded` |
| Candidate decision | `NO_GO_UNTIL_ACCEPTED_OPERATIONAL_EVIDENCE` |
| Superseded by | `docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md` |

The release candidate in this packet is a historical draft baseline. It must not
be used for new protected staging, support bundle, runtime image or final launch
evidence unless a release-owner candidate-promotion PR intentionally reselects
it and regenerates the active launch packet.

## Artifact Identity

| Artifact | Evidence |
|---|---|
| `package-lock.json` digest | `sha256:c3fc6345c8916840a2b3dede5c3ca5b7c047e369b92ecf59b10f1b4dfb20fe0b` |
| Migration plan digest | `sha256:0e174f53b11db2648a7c241051cf1512c0f707f4bec75724e32f83214fd3c34a` |
| Support deployment bundle | `artifacts/deployment-bundles/tecpey-deployment-03e77790630dac737a2d4cc4636b97e80de48ab3.zip` |
| Deployment bundle digest | `sha256:f6e5b547081a0b64e826888b4d49412fdc080cc410c91fb1b9729a50203d2f29` |
| Bundle verifier | `npm run support:bundle:verify -- artifacts/deployment-bundles/tecpey-deployment-03e77790630dac737a2d4cc4636b97e80de48ab3.zip artifacts/deployment-bundles/tecpey-deployment-03e77790630dac737a2d4cc4636b97e80de48ab3.zip.sha256` passed. |
| Bundle entries | 2732 entries, single root `tecpey-deployment-03e77790630dac737a2d4cc4636b97e80de48ab3`. |
| Image digest | Missing. A final packet requires immutable container or runtime image evidence. |

The support bundle was created from a detached clean worktree at the candidate
SHA with `TECPEY_SOURCE_BUNDLE_EXCEPTION_APPROVED=1`. The zip itself is a local
draft artifact and is not committed to the repository.

## Focused Gate Results

| Gate | Result | Evidence interpretation |
|---|---|---|
| `npm run launch:decision:check` | PASS | Go/No-Go remains NO-GO by default; final manifest wiring, packet tests and disabled capability attestation are enforced. |
| `npm run ui:public:check` | PASS | Public UI foundation and official brand asset authority pass after the brand lock PRs. |
| `npm run browser:persistence:check` | PASS | Browser persistence guard reports 25 classified matching lines across 7 production files; official community challenge/history evidence remains persistence-free. |
| `npm run custody:check` | PASS | Wallet custody launch gate remains enforced. This does not certify production custody. |
| `npm run withdrawals:check` | PASS | Withdrawal read, outage, admission, pre-broadcast, runtime and external-effect evidence guards pass. Real withdrawals remain custody-gated. |
| `npm run exchange:check` | PASS | Exchange admission, evidence and reconciliation authority checks pass for the gated core. Real-money Exchange remains NO-GO. |
| `npm run release:coverage:check` | PASS | All 54 `release:check` gates are reachable from 12 workflows. |
| `npm run security:secrets:check` | PASS | Secret scanning authority reports Gitleaks 8.30.1 and 55 exact reviewed identities. |
| `npm run ip:ownership:check` | PASS | Source ownership, controlled delivery policy, support handoff, production contract and bundle verifier remain synchronized. |
| `npm run check` | PASS | ESLint, correctness authority, authority tests and TypeScript pass. |
| `npm run build` | PASS | Next.js build and server bundle pass; 495 static pages generated. Local build logs expected fail-closed `DATABASE_URL` messages because this sandbox has no production database secret. |
| `npm run env:check` | FAIL in sandbox | Expected local blocker: production/staging URLs, secrets, trusted proxy settings and `DATABASE_URL` are not configured here. Final evidence must come from the protected staging or production-like environment. |

Full `npm run release:check` was not run end-to-end in this sandbox because it
starts with `env:check`, which correctly fails without protected environment
secrets. The focused constituents above were run to capture locally executable
release evidence without weakening the final evidence requirement.

## Disabled Capability Attestation

The generated packet and focused gates preserve these launch boundaries:

| Capability | Controlled launch stance |
|---|---|
| Real-money Exchange | NO-GO unless separately certified. |
| Custody, deposits and withdrawals | NO-GO unless separately certified. |
| Public financial rewards | NO-GO unless separately certified. |
| Enterprise and white-label activation | NO-GO unless separately certified. |

Any final Go packet must prove that these surfaces cannot be activated
accidentally through routes, environment flags, UI copy, workers or support
handoff instructions.

## Missing Final Evidence

The draft packet intentionally leaves these final evidence fields empty:

| Missing evidence | Required before Go |
|---|---|
| Image digest | Immutable container or runtime image digest for the exact candidate. |
| CI run URL | Exact-head CI evidence for the candidate. |
| Full Suite run URL | Exact-head Full Suite Diagnostics evidence for the candidate. |
| API Security run URL | Exact-head API Security Manifest evidence for the candidate. |
| Sensitive Mutation run URL | Exact-head Sensitive Mutation Audit evidence for the candidate. |
| Repository audit run URL | Exact-head repository audit evidence. |
| Public Golden Path run URL | Browser Golden Path evidence for public FA/EN and controlled Academy/Arena paths. |
| Operational Recovery run URL | Exact-head Scheduled Operational Recovery evidence for the candidate. |
| Container Supply Chain run URL | Exact-head Container Supply Chain evidence for image digest, SBOM and rollback/volume recovery jobs. |
| Secret scanning run URL | Exact-head secret scanning workflow evidence. |
| Protected staging evidence URL and digest | Accepted artifact satisfying `docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md`. |
| Recovery reconciliation evidence URL and digest | Accepted artifact satisfying `docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md`. |
| Rollback or forward-fix evidence URL and digest | Candidate rollback evidence or approved forward-fix decision. |
| Incident readiness evidence URL and digest | Accepted artifact satisfying `docs/operations/INCIDENT_READINESS_CONTRACT.md`. |
| Accepted risk sign-off URL | Owner-approved accepted-risk register for this exact candidate. |
| Go approvals URL | CEO, CTO or Chief Architect, Security, Product, Compliance, SRE and QA approval evidence. |

## Decision

This packet is useful because it narrows a historical launch conversation to one
draft SHA and one evidence checklist. It is not a release approval and is not the
current evidence target. The correct decision remains:

**NO-GO until the exact current candidate has complete accepted operational
evidence, protected staging evidence, recovery and rollback proof, incident
readiness, accepted-risk sign-off and executive approval.**
