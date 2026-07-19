# API Security Manifest Review Checklist

Before this branch can leave draft status:

- [x] the deterministic baseline is committed from the exact generated source tree;
- [x] every mutating operation is represented exactly once and in deterministic order;
- [x] method-scoped evidence prevents one handler from lending controls to a sibling handler;
- [x] imports, comments, unused helpers, and naming conventions cannot satisfy runtime security evidence;
- [x] raw `Authorization` reads cannot satisfy service identity without governed verification or cryptographic validation;
- [x] the permanent read-only drift check is installed in `.github/workflows/api-security-manifest.yml`;
- [x] temporary bootstrap and self-mutating workflows are absent from the final diff;
- [x] 75 findings across 55 operations are covered by exact issue-linked, owner-scoped, expiring exceptions: 48 body limits, 19 strict revocation, 5 idempotency, and 3 audit gaps;
- [x] expired, malformed, wildcard, duplicate, stale, missing, unknown-field, or route-ambiguous exceptions fail CI;
- [x] `Content-Length` hints cannot satisfy the enforceable body-limit requirement;
- [x] operation overrides cannot manufacture body-limit, idempotency, audit, CSRF, service-identity, or other security evidence;
- [x] manifest totals, hashes, controls, requirements, findings, evidence resolution, cache-policy evidence, and allowed keys are validated;
- [x] negative tests cover stale totals, forged findings, unresolved evidence, import/comment-only evidence, blanket overrides, unsafe caching, wildcard exceptions, and unbounded bodies;
- [ ] API Security Manifest passes in a fresh run on the exact final owner-authored PR head;
- [ ] Full Suite Diagnostics, Exchange Authority, and repository CI pass in fresh runs on that same head;
- [x] `main` remains unchanged until approved merge.
