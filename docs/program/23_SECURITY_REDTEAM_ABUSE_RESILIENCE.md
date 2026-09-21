# Security Red Team & Abuse Resilience

**Base:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** runs continuously, but final certification follows stabilization of auth/commerce/research/financial/tenant tracks. Supports issue #100 and #708 launch hardening.

## Objective
Prove that TecPey's security posture survives adversarial behavior rather than only happy-path tests.

## Standards anchors
- OWASP ASVS 5.0 (released May 2025) as application verification baseline;
- OWASP API Security Top 10 2023 for API-specific attack classes;
- NIST SSDF SP 800-218 final 1.1 as secure-development baseline; current Rev.1/1.2 remains draft and is treated as informative until final.
Sources:
- https://owasp.org/
- https://owasp.org/projects/api-security-project
- https://csrc.nist.gov/pubs/sp/800/218/final
- https://csrc.nist.gov/pubs/sp/800/218/r1/ipd

## Attack domains
- authentication/session/recovery/MFA/social login;
- tenant/principal isolation and admin privilege escalation;
- API object/property/function authorization;
- CSRF/CORS/CSP/cookie/proxy trust/header smuggling assumptions;
- rate-limit/credential stuffing/OTP abuse/resource exhaustion;
- file/media upload and content sanitization;
- SSRF/webhook/callback/provider egress;
- AI prompt injection, tool abuse, data exfiltration, cross-tenant memory/research leakage;
- commerce/webhook replay/idempotency;
- Arena/league manipulation and reward abuse;
- real-money order/custody/withdrawal abuse when those tracks reach certification;
- supply chain, dependency, build provenance and secret exposure;
- recovery/incident behavior under deliberate fault injection.

## Method
- threat-model assets/trust boundaries/abuse cases per track;
- automated adversarial regression suite + targeted manual review;
- mutation testing/load-bearing tests for critical guards;
- fail-open hunting: disable Redis/provider/DB/worker and verify policy;
- privilege-difference matrix and cross-tenant corpus;
- rate/resource budgets with safe test environment;
- findings have severity, exploit preconditions, evidence, owner, regression test and closure SHA.

## Evidence
No raw production secrets/customer data in red-team artifacts. PoCs use synthetic/test tenants. A closed finding must have a reproducer and a regression control; “cannot reproduce now” is not closure.

## Acceptance
No unresolved P0/P1 finding for the selected launch scope, all critical trust boundaries have negative evidence, and exact-head regression checks are attached to #708 launch packet.
