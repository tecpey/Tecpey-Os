# Sensitive Mutation Audit Review Checklist

PR #147 may leave draft status only when every item below is satisfied on the same owner-authored head.

## Scope and authority

- [x] all three governed audit gaps are remediated:
  - `POST /api/device-token`
  - `POST /api/mentor-conversations/migrate`
  - `POST /api/mentor-profile/recompute`
- [x] every mutation uses a strict revocation-aware server session;
- [x] actor and resource authority are derived from the authenticated session, never request-body identity fields;
- [x] mutation and audit evidence commit or roll back in the same PostgreSQL transaction;
- [x] the audit ledger requires tenant, actor, action, resource, outcome, correlation ID, request hash, metadata, and timestamp;
- [x] exact duplicate correlation evidence is safe while changed or cross-user reuse conflicts;
- [x] audit evidence is append-only and cannot be updated or deleted;
- [x] audit rejection fails closed and rolls back the mutation.

## Privacy and redaction

- [x] device tokens are represented only by one-way hashes in audit evidence;
- [x] conversation text is represented only by hashes in request evidence and aggregate counts in metadata;
- [x] profile goals and weak/strong-area labels are excluded from audit metadata;
- [x] application and PostgreSQL recursively reject token, conversation, credential, contact, request-body, authorization, and cookie metadata keys;
- [x] metadata is byte bounded at 16 KiB;
- [x] stored evidence tests prove raw token and conversation values are absent.

## Database and governance

- [x] migration `0033_sensitive_mutation_audit.sql` is registered in the canonical migration plan;
- [x] migration integration verifies the audit table, columns, indexes, validation trigger, and append-only triggers;
- [x] the dedicated authority guard prevents replacement with non-blocking legacy audit;
- [x] the dedicated read-only workflow runs migrations, authority checks, PostgreSQL tests, and TypeScript;
- [x] API runtime evidence recognizes only actual strict audit calls, not imports or comments;
- [x] `missing_audit_or_observability_evidence` is zero;
- [x] strict-revocation findings are reduced from 19 to 16;
- [x] the resolved #144 exception group and three resolved #142 entries are removed;
- [x] the committed manifest contains 64 remaining unrelated findings: 48 body-size and 16 strict-revocation gaps;
- [x] temporary baseline workflows are absent from the final diff;
- [x] `main` remains unchanged until approved merge.

## Exact-head merge gates

- [ ] Sensitive Mutation Audit passes on the final owner-authored head;
- [ ] API Security Manifest passes on that same head;
- [ ] Full Suite Diagnostics passes on that same head;
- [ ] Exchange Authority passes on that same head;
- [ ] repository CI, including migrations, TypeScript, focused PostgreSQL tests, full tests, build, and runtime smoke, passes on that same head;
- [ ] review threads are resolved and the exact head is mergeable.
