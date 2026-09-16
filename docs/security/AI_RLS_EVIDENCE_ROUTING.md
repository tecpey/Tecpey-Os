# AI RLS protected evidence routing

The protected PostgreSQL 16 tenant-RLS evidence workflow is reusable for any pull request whose base is `main` and whose head belongs to `tecpey/Tecpey-Os`.

Admission is intentionally based on repository trust and immutable pull-request source identity, not on a historical branch name. The protected job checks out `github.event.pull_request.head.sha`, verifies that exact commit, derives `HEAD^{tree}`, and binds both identities into the evidence verifier.

The following controls remain mandatory and fail closed: protected environment approval, same-repository head, `main` base, exact SHA/tree binding, pinned PostgreSQL 16 runtime, zero-skip adversarial execution, least-privilege fixture provisioning, redacted evidence, detached SHA-256 verification, GitHub OIDC provenance attestation, and artifact upload failure on missing evidence.

`pull_request_target`, secret-backed production/staging database credentials, `continue-on-error`, branch-name allowlists, deployment authority, and reuse of evidence from a different commit or tree are not admission mechanisms.

Historical evidence remains valid only for the exact commit/tree and workflow provenance to which it was originally bound. Generalizing admission does not relabel or extend historical evidence to a later candidate.
