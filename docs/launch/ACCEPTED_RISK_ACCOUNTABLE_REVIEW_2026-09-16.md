# Accepted-Risk Accountable Review — 2026-09-16

## Authority

This record binds the project owner's explicit 2026-09-16 accountable review of the controlled-launch decisions, measurable thresholds, and rollback/halt triggers for R-01, R-02, R-04, R-05, R-06, R-07, R-09, and R-10.

The reviewed decisions and boundaries are unchanged. R-08 is deliberately excluded from this refresh and remains on its existing biweekly review deadline of 2026-09-28.

Source register authority: `docs/LAUNCH_ACCEPTED_RISKS.md` at base commit `444f63ff53e42c605df478b88d3cd92747979488`.

Review discussion authority: PR #654, including the 2026-09-16 project-owner confirmation and the live R-04 acknowledgement evidence.

## Reviewed dispositions

- R-01 — OPEN / CONTROLLED. Canonical Academy progress, assessments and certificates remain server-authoritative; browser-owned engagement/gamification state remains an accepted controlled-launch limitation under the existing thresholds and rollback boundary.
- R-02 — OPEN / CONTROLLED. User-facing market/chart display remains educational/virtual-context only. No financial-grade or independently verified live-market-data claim is admitted.
- R-04 — REVIEWED / EVIDENCE-PENDING. The existing operational threshold is unchanged. Human P0 acknowledgement evidence is current, but protected-staging synthetic delivery, zero pending/quarantine, latency, exact-runtime and artifact evidence remain independently required before the related Go gate can close.
- R-05 — CONTROLLED / FINANCIAL BOUNDARY UNCHANGED. Redis may support non-custodial controlled-launch functions; real-money withdrawals remain disabled. Any reachable real withdrawal path while degraded remains hard NO-GO.
- R-06 — OPEN / CONTROLLED. Controlled education certificate signing remains permitted under the existing compromise/forgeability/verification halt trigger. Rotation/versioning/revocation authority remains unresolved and is not represented as closed.
- R-07 — HARD NO-GO UNCHANGED. Zero real-money orders, deposits, withdrawals, public rewards or custody settlements are permitted.
- R-09 — CONTROLLED / OPERATIONAL EVIDENCE DISTINCT. The 09:00–23:00 Asia/Tehran support window and P0/P1 acknowledgement targets remain unchanged. Current drill evidence remains independently required where the launch gate demands it.
- R-10 — HARD NO-GO UNCHANGED. Hot-wallet readiness is not accepted; custody and withdrawal readiness must not be implied by UI, API, worker or status claims.

## R-04 human acknowledgement evidence

For the live drill declared on PR #654 against staging release `444f63ff53e42c605df478b88d3cd92747979488`:

- declaration: `2026-09-16T06:31:52Z` by `tecpey`;
- Incident Commander acknowledgement: `2026-09-16T06:38:36Z` by `tecpey` — 6m44s;
- SRE Owner acknowledgement: `2026-09-16T06:39:45Z` by `tecpeysup` — 7m53s;
- independent review: `2026-09-16T06:40:10Z` by `xrayman6zfm-ux`.

Both accountable P0 acknowledgements are within the existing fifteen-minute support-hours target. These timestamps establish only the human acknowledgement portion; they do not substitute for the protected workflow evidence.

## Parser blocker

Protected incident evidence run #4 failed before synthetic alert delivery because the main-branch workflow parser rejected a valid quoted systemd environment value containing internal spaces. PR #656 hardens that parser while preserving fail-closed file, key, duplicate, empty-value, CA-path, CA-file and X.509 checks. The PR #656 parser has been reproduced read-only against the real staging environment with `PR656_REAL_STAGING_ENV_PARSE_OK`; no environment value was exposed and no staging mutation was made.

R-04 therefore remains evidence-pending until the protected workflow can execute successfully from `refs/heads/main` with the corrected parser.

## Governance effect

This review is not NOG-08 accepted-risk owner sign-off, not a Go decision, not a replacement or relabeling of historical candidate-bound sign-off artifacts, and not authorization to merge, deploy, mutate staging, mutate a database, activate AI executors or News automation, or change production.

Real-money Exchange, custody, deposits, withdrawals, public rewards, enterprise and white-label surfaces remain NO-GO/product-disabled.

The next weekly accountable review deadline for R-01, R-02, R-04, R-05, R-06, R-07, R-09 and R-10 is `2026-09-23`. R-08 remains `2026-09-28`.
