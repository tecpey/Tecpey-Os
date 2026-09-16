# Accepted-Risk Evidence Review — 2026-09-16

## Authority and purpose

This packet opens the accountable freshness review for the controlled-launch accepted-risk register after the 2026-09-15 review deadlines elapsed. It is an evidence-review record only. It does not extend a review date, accept NOG-08, approve a Go decision, activate a capability, or replace owner sign-off.

Source authority: `docs/LAUNCH_ACCEPTED_RISKS.md` on base commit `444f63ff53e42c605df478b88d3cd92747979488`.

Controlled scope remains limited to public FA/EN, Academy, Mentor, and virtual Arena. Real-money Exchange, custody, deposits, withdrawals, public rewards, enterprise, and white-label surfaces remain NO-GO/product-disabled unless separately admitted by their governed evidence gates.

## Review method

For each stale row, the reviewer must verify the current repository/runtime evidence against the existing decision, measurable threshold, mitigation, and rollback/halt trigger. A date may be refreshed only after that review. Reduced or resolved risks must be reconciled rather than mechanically extended. Historical owner sign-off artifacts remain bound to their original candidate SHA and digest and must not be relabeled for a later candidate.

## Evidence-backed review matrix

| Risk | 2026-09-16 disposition | Evidence/review requirement before freshness refresh |
|---|---|---|
| R-01 | REVIEW REQUIRED — reduced but unresolved in current register | Confirm canonical Academy progress/assessment/certificates remain server-backed and determine whether XP, streaks, missions, or badges remain browser-owned on live Academy surfaces. If browser-owned engagement state remains, retain the existing loss threshold and rollback boundary or reconcile it with new server-persistence evidence. |
| R-02 | REVIEW REQUIRED — controlled educational/virtual display boundary remains | Verify current market-board/data-source authority and user-facing accuracy claims. Do not infer financial-grade price authority from withdrawal-path consensus. Preserve paper/education-only restriction unless independent display-price evidence changes the risk. |
| R-04 | REVIEW REQUIRED — evidence-sensitive operational risk | Bind current protected-staging alert-delivery evidence to the existing threshold: two successful synthetic critical deliveries, zero pending, zero quarantine, delivery latency under five minutes, and P0 acknowledgement within fifteen minutes during support hours. If any element is absent, keep the related Go gate NO-GO rather than extending by assertion. |
| R-05 | REVIEW REQUIRED — hard financial boundary retained | Verify Redis health/degraded-mode behavior and prove no real-money withdrawal path is reachable. Real withdrawals remain disabled; any reachable real withdrawal path is a hard NO-GO. |
| R-06 | REVIEW REQUIRED — certificate trust boundary retained | Verify controlled education certificate signing/verification authority and incident/rotation controls. Any suspected signing-secret compromise, forgeability, or legitimate verification failure keeps issuance halted under the existing trigger. |
| R-07 | REVIEW REQUIRED — hard NO-GO retained | Confirm zero activation of real-money orders, deposits, withdrawals, public rewards, and custody settlement. No freshness update may weaken the zero-activation boundary. |
| R-08 | FRESH through 2026-09-28 — no date change requested | Preserve Persian-first decision and existing non-Persian traffic/qualified-lead thresholds. This packet does not re-review or extend R-08. |
| R-09 | REVIEW REQUIRED — operational ownership boundary retained | Verify the declared 09:00–23:00 Asia/Tehran support window and P0/P1 acknowledgement capability against current incident-readiness evidence. A missed P0 target or material user harm retains the launch-expansion pause trigger. |
| R-10 | REVIEW REQUIRED — hard custody NO-GO retained | Confirm hot-wallet readiness is not claimed and custody/withdrawal UI, API, and worker paths remain product-disabled. Any readiness implication remains a hard NO-GO until independent certification/reconciliation evidence exists. |

## Admission rules for the follow-up register change

A follow-up change to `docs/LAUNCH_ACCEPTED_RISKS.md` is admissible only when all of the following are true:

1. Each stale risk above has an explicit reviewed disposition supported by current evidence.
2. A risk that changed materially is reconciled in substance; its date is not merely advanced.
3. Any unchanged weekly review receives a new exact accountable review deadline only after the accountable review is recorded.
4. R-04 evidence is treated independently from a freshness date; missing protected-staging alert evidence keeps its Go boundary closed.
5. R-07 and R-10 retain zero real-money/custody activation regardless of other evidence.
6. R-08 remains on its existing biweekly cadence unless separately re-reviewed.
7. Historical NOG-08 sign-offs are not reused or relabeled for a new candidate SHA/digest.
8. This review does not itself authorize merge, deploy, staging mutation, database mutation, AI executor activation, News activation, or any production change.

## Current decision

`REVIEW_OPEN / NO-GO UNCHANGED`

The stale review deadlines are intentionally left stale in the authoritative register until the evidence review and accountable human review are complete. This preserves fail-closed CI behavior while producing an auditable record of what must be revalidated.