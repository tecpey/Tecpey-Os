# PR 616: CI review

2026-09-08. Candidate only; not merged or deployed.

Remote application candidate: `8e3d1704fe296ec9528e319f7de97f246a07a1dc`.

Full Suite Diagnostics run 34149009439 applied database migrations and ran
1,741 tests: 1,740 passed, zero failed, one skipped (legacy-cookie window).
Two additional suites passed 1 and 5 tests. Both new Academy PostgreSQL
identity cases executed successfully, including verified-phone candidate
ambiguity and rejection of username/conflicting-identity selection.
This supersedes the earlier local PostgreSQL limitation, but does not certify
historical account ownership or live browser acceptance.

Follow-up corrections:

- ESLint's reviewed Arena finding moved from line 680 to 681 after the import
  addition. Both exact location registries now match. No new baseline entry,
  suppression, disabled rule or exception was introduced.
- The new identity helper caused the API scanner to classify refresh as
  authenticated. Its existing `rotateSessionAuthority` call verifies token,
  family and device revocation under database locks before cookies publish.
  The runtime evidence scanner now recognizes this call; negative tests reject
  imports, comments and signature-only verification as evidence. This is static
  evidence, supplemented by the existing refresh PostgreSQL regression suite.
- Nine operation records change: route/delegation hashes, test references and
  refresh classification/principal/revocation evidence. The exact delta ledger
  records these changes against the prior reviewed hashes. No exception added.

Local follow-up checks: API manifest passes with zero findings and zero
exceptions; 71 API policy/cache tests pass; ESLint correctness authority passes
with the same 29 reviewed entries. New remote CI is required before merge.

Still pending: current-head CI, live FA/EN login/profile/refresh/2FA acceptance,
historical ownership review and staging deployment with matching health SHA.
