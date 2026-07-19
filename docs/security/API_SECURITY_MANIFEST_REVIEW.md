# API Security Manifest Review Checklist

Before this branch can leave draft status:

- [ ] bootstrap artifact downloaded and committed as the deterministic baseline;
- [ ] every mutating operation is represented exactly once;
- [ ] generator output is stable across two consecutive runs;
- [ ] permanent CI drift check is installed in `.github/workflows/ci.yml`;
- [ ] temporary bootstrap workflow and bootstrap note are deleted;
- [ ] existing findings are either fixed or covered by explicit issue-linked exceptions with expiry;
- [ ] expired, malformed, wildcard, or route-ambiguous exceptions fail CI;
- [ ] manifest checker has negative tests for missing route, stale hash, missing CSRF, missing strict revocation, unbounded body, missing public rate limit, missing idempotency, unsafe caching, and unauthenticated internal mutation;
- [ ] full CI passes on the exact PR head;
- [ ] `main` remains unchanged until approved merge.
