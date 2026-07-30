# Repository line-review program

Issue [#156](https://github.com/tecpey/Tecpey-Os/issues/156) is a repository-wide review program. A passing build, a point-in-time architecture report, or the existence of this framework does not complete it.

## Batch 0: deterministic denominator

`npm run audit:manifest` reads the exact committed Git tree and produces
`artifacts/repository-audit/repository-manifest.json`. It does not inventory
uncommitted working-tree content. CI binds the checkout and manifest to the pull
request head SHA through `TECPEY_AUDIT_SOURCE_SHA`.

Every tracked path receives:

- Git mode and object ID;
- file type, byte count, text line count where applicable, and SHA-256 digest;
- text/binary content classification and source/generated/vendored provenance;
- product domain, P0–P3 risk tier, and one of the twelve review batches;
- bounded automated scan results with line numbers;
- explicit semantic or ownership review status;
- nullable review evidence, remediation links, and reviewed commit SHA;
- the exact commit used for inventory.

The initial status is deliberately pending. Source text is
`semantic-review-pending`; binary, generated, and vendored material is
`ownership-review-pending`. `completionClaim` remains `false`. Future review
batches must add evidence rather than rewriting pending records as completed
without review.

## Evidence guarantees

- `git ls-tree` is the denominator. No filesystem walk or ignore pattern can
  silently omit a tracked path.
- Blob bytes come from Git objects at the exact source commit, so dirty or
  untracked local files cannot alter the report.
- The verifier regenerates the complete manifest and requires byte-for-byte
  structural equality.
- Pull-request checkout uses the PR head SHA, not GitHub's synthetic merge SHA.
- The manifest is uploaded as an immutable exact-head workflow artifact. It is
  not committed, avoiding a self-referential digest and immediately stale SHA.
- Binary content is never decoded as text. Its semantic scan is explicitly
  marked not applicable, while ownership review remains required.
- Automated scanning is intentionally narrow: unresolved conflict markers are
  P1 and standalone source-comment TODO/FIXME/HACK annotations are P3 review
  debt. Prose, string literals, scanner definitions and Markdown headings do
  not become findings. These results do not substitute for semantic review.

## Review batches

| Batch | Scope |
|---:|---|
| 1 | Root, CI, supply chain and runtime bootstrap |
| 2 | Database schema, migrations and persistence infrastructure |
| 3 | Authentication, authorization, tenant and admin security |
| 4 | Academy and educational integrity |
| 5 | Trading Arena and behavioral evidence |
| 6 | Exchange, ledger and financial precision |
| 7 | Wallet, withdrawal and custody |
| 8 | Mentor AI, memory and provider governance |
| 9 | CRM, notifications, social and privacy |
| 10 | UI/UX, bilingual parity, accessibility and performance |
| 11 | Operations, deployment, observability and recovery |
| 12 | Tests, documentation, dead-code/provenance and reconciliation |

Each future batch must publish the exact reviewed paths and lines, findings by
severity, remediation links, residual risk, and unchanged-head verification.
Large remediations belong in bounded domain pull requests.

## Batch 1A: audit-authority semantic evidence

The first bounded semantic slice reviews only the repository-audit authority
itself. Its committed declaration records the exact Git blob, SHA-256 digest,
line count, complete contiguous line ranges, review notes, confirmed findings,
remediation references and residual risk for each reviewed file.

CI applies a declaration only when every reviewed blob still matches. The
generated manifest binds accepted evidence to the exact checkout through
`reviewedCommitSha`; changing one reviewed byte or leaving one line outside the
declared ranges fails closed. Files outside this bounded slice remain pending,
and `completionClaim` remains `false`.

## Batch 1B: operational-workflow semantic evidence

The second bounded slice reviews four production-facing GitHub workflows and
the production host supply-chain policy. It records three remediated P1
findings: publication without recovery dependency, omission of unfixed HIGH or
CRITICAL vulnerabilities, and browser-gate path filters that could skip shared
runtime or security changes.

Policy v10 accepts multiple independently identified evidence slices while
binding each finding and residual-risk identifier to its declaring slice.
Batch 1B adds five semantically reviewed paths; all other paths remain pending
and `completionClaim` remains `false`.

## Batch 1C: CI evidence integrity

The third bounded slice reviews the five remaining CI and staging-evidence
workflows plus their structural policy and negative tests. Pull-request
artifacts are now named with the exact checked-out head SHA instead of GitHub's
synthetic merge SHA, every governed job has a bounded timeout, every Node
workflow verifies the npm 10 runtime contract, and staging evidence rejects a
release older than the approved scheduler-authority baseline. Exact-head CI
also exposed destructive migration tests sharing PostgreSQL state with other
suites; their UUID-scoped database fixtures now make the required test result
independent of suite scheduling order.

Policy v11 binds the third independently identified evidence slice. Batch 1C
adds seven semantically reviewed paths; all other paths remain pending and
`completionClaim` remains `false`.

## Batch 1D: root configuration authority

The fourth bounded slice reviews the repository and Docker ignore boundaries,
production environment template, agent instructions, ESLint, Next.js,
PostCSS, TypeScript and their permanent structural policy. Real environment
files now fail effective Git ignore checks across production, staging, test and
development names; Docker excludes generated evidence and local agent state;
CommonJS configuration is linted; and speculative DNS prefetch is disabled.

Policy v12 binds the fourth independently identified evidence slice. Batch 1D
adds eleven semantically reviewed paths and 480 reviewed lines; all other paths
remain pending and `completionClaim` remains `false`.

## Batch 1E: contribution governance

The fifth bounded slice reviews the two issue templates, pull-request template,
contributor contract, Code of Conduct, proprietary license and their permanent
policy. Contributor setup now uses the lockfile-backed install without a
nonexistent environment template; feature requests point to the current master
roadmap; and the PR/contributor security contract covers all four governed
mutating methods plus API Security Manifest evidence.

Policy v13 binds the fifth independently identified evidence slice. Batch 1E
adds seven semantically reviewed paths; all other paths remain pending and
`completionClaim` remains `false`.

## Local verification

```bash
npm run audit:manifest:check
npm run audit:manifest
npm run audit:manifest:verify
npm run test:audit-manifest
```

Do not close #156 until every pending status has accepted evidence, all P0/P1
findings are remediated or retain an explicit release NO-GO, README claims are
reconciled to the final exact head, and the final report publishes the full
denominator and executive release recommendation.
