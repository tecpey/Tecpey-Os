# Financial Compliance Control Plane — KYC/KYT, sanctions and case authority

**Base:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** #698 identity/KYC authority. Required before any #714/#715 real-money activation. Jurisdiction/provider-specific legal conclusions require qualified counsel and configured policy; code must not invent legal eligibility.

## Objective
Provide a provider-neutral compliance authority for financial capabilities while preserving the education-first product when those capabilities are disabled.

## Deliverables
- versioned jurisdiction/policy registry with effective dates and feature scope;
- KYC decision adapter interface separated from identity-authentication state;
- sanctions/PEP/adverse-media screening adapter with provider/source metadata, match score/reason and explicit human-review state;
- KYT/transaction-monitoring event model for deposits, withdrawals and real-money transfers;
- compliance case state machine: open → investigating → information_required → cleared / restricted / rejected / escalated;
- immutable decision/audit events; manual override requires role, reason and evidence;
- hold/release authority consumed by financial admission paths;
- screening freshness/re-screen rules without silently rewriting historical decisions;
- privacy minimization, retention/erasure/legal-hold policy metadata;
- user-facing reason categories that disclose enough to guide remediation without exposing detection rules;
- provider outage → fail-closed for regulated activation, while Academy/virtual Arena remain available where policy permits.

## Separation of duties
Authentication, identity proofing, sanctions screening, transaction monitoring and financial feature admission are distinct authorities. “KYC verified” never means “all transactions approved”.

## Testing
- cross-tenant/cross-principal case isolation;
- stale screening;
- provider timeout/ambiguous result;
- duplicate webhook/case event;
- manual override audit;
- sanctioned/restricted user financial admission denial;
- education-only capability remains unaffected.

## Research/security anchors
- NIST identity guidance is used for identity assurance, not legal eligibility.
- OWASP/API authority principles require object/property/function authorization on every case/screening resource.
- policy/legal text is configuration governed by counsel, not model-generated runtime law.

## Acceptance
Every real-money admission can explain which compliance authority allowed/denied/held it, with policy version and audit chain. No regulated capability activates solely from a UI/KYC badge.
