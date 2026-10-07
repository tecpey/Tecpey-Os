# Exact-head CI evidence checklist

This file is intentionally evidence-only. Populate only from GitHub Actions results for the final PR head; do not infer success from earlier SHAs.

- [ ] CI / typecheck / lint / tests / production build
- [ ] migration registry validation
- [ ] migration idempotency
- [ ] governed migration lock / concurrency
- [ ] Academy V3 PostgreSQL decision-invariant race proof
- [ ] API Security Manifest
- [ ] Sensitive Mutation Audit
- [ ] Full Suite Diagnostics
- [ ] Public Browser Golden Path
- [ ] Scheduled Operational Recovery
- [ ] AI tenant isolation evidence, when required by the current workflow set

No checkbox may be marked from a superseded head SHA.
