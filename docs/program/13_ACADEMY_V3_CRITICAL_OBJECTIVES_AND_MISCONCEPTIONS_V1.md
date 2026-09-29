# Academy V3 — Critical Objectives & Misconceptions V1

Status: Phase 1 governed content design
Date: 2026-09-25

This registry starts with safety-critical concepts. It is deliberately small enough for expert review before expansion.

## T2.SEED_RECOVERY

Objectives:
- Explain why a recovery phrase can represent wallet authority and why support normally cannot reset it.
- Reject requests to enter a recovery phrase into untrusted sites/apps/support flows.
- Choose an appropriate response after suspected phrase exposure.

Misconceptions:
- M.SEED.RESET: “Support can reset a leaked seed like a password.” Correction: compromise normally requires moving assets to newly secured keys/wallet.
- M.SEED.CLOUD: “A private cloud photo is a safe backup by default.” Correction: digital copies expand compromise surface.
- M.SEED.VERIFY: “Support needs the seed to verify ownership.” Correction: legitimate support should not request secret recovery material.

Evidence: retrieval + adversarial scenario + changed-context reassessment. Self-report is insufficient.

## T2.TRANSFER_SAFETY

Objectives:
- Verify asset, network, destination, address and memo/tag requirements before transfer.
- Explain why a cheaper network is not safe if the destination does not support it.
- Use a bounded test transfer when context warrants it.

Misconceptions:
- M.TRANSFER.CHEAPEST: “Choose the cheapest network.” Correction: compatibility and destination requirements precede fee optimization.
- M.TRANSFER.ADDRESS_ONLY: “Matching the address is enough.” Correction: asset/network/memo/tag/destination context can also be required.
- M.TRANSFER.REVERSIBLE: “Support can always reverse a wrong transfer.” Correction: recovery varies and may be impossible.

Evidence: checklist application + scenario diagnosis + reassessment.

## T4.SOURCE_VERIFICATION

Objectives:
- Distinguish primary evidence, secondary analysis and promotional claims.
- Check provenance, date/freshness and corroboration before relying on mutable claims.
- Identify what evidence would falsify or weaken a project claim.

Misconceptions:
- M.SOURCE.POPULAR: “High follower count is corroboration.”
- M.SOURCE.MULTIPLE: “Many sites repeating one original claim are independent sources.”
- M.SOURCE.RECENTPRICE: “Recent price performance validates the underlying claim.”

Evidence: source classification + evidence-selection scenario + disconfirmation task.

## T5.INVALIDATION

Objectives:
- State a testable condition that would make an analysis thesis no longer valid.
- Separate invalidation from emotional loss tolerance.
- Use invalidation as an input to risk planning rather than moving it to avoid accepting error.

Misconceptions:
- M.INVALIDATION.HOPE: “The thesis remains valid as long as I still believe it.”
- M.INVALIDATION.STOPONLY: “Invalidation is just a stop-loss price.” Correction: it is the evidence/condition that breaks the reasoning; execution controls are downstream.
- M.INVALIDATION.MOVE: “Moving invalidation farther away reduces the chance of being wrong.”

Evidence: thesis critique + changed-context scenario + Arena transfer.

## T6.POSITION_SIZING

Objectives:
- Determine position size from bounded risk and invalidation distance in a simplified scenario.
- Explain why conviction does not justify unbounded size.
- Reduce or reject a position when the risk budget cannot support the setup.

Misconceptions:
- M.SIZE.FIXED: “Use the same position size for every setup.”
- M.SIZE.CONVICTION: “Higher confidence should automatically mean much larger risk.”
- M.SIZE.STOP: “A tighter stop always makes the trade safer.”

Evidence: calculation + scenario choice + transfer. Calculation policy must be explicit and versioned.

## T6.DRAWDOWN

Objectives:
- Explain why percentage loss and required percentage recovery are asymmetric.
- Select risk-reduction/review behavior after a governed loss boundary is reached.
- Reject escalation intended only to recover losses quickly.

Misconceptions:
- M.DD.SYMMETRY: “A 50% loss needs a 50% gain to recover.”
- M.DD.RECOVERFAST: “Larger size is rational because recovery must be fast.”
- M.DD.OUTCOME: “A winning revenge trade proves the process was acceptable.”

Evidence: calculation + process judgment + delayed reassessment.

## T6.REVENGE

Objectives:
- Recognize loss-triggered urgency/escalation patterns.
- Apply a predefined pause/review protocol.
- Separate desire to recover money from setup quality.

Misconceptions:
- M.REVENGE.DEBT: “The market owes the loss back.”
- M.REVENGE.SIZE: “Increasing size after a loss restores expected outcome.”
- M.REVENGE.WIN: “If the next impulsive trade wins, the decision was good.”

Evidence: scenario diagnosis + no-action decision + journal/process review.

## T6.NO_TRADE

Objectives:
- Identify conditions where insufficient evidence, poor risk/reward, operational uncertainty or emotional state justify no action.
- Defend a no-trade decision using explicit criteria.
- Reassess when new evidence arrives.

Misconceptions:
- M.NOTRADE.MISSED: “No trade means failure or missed productivity.”
- M.NOTRADE.ALWAYSOPPORTUNITY: “A serious trader must always have a position.”
- M.NOTRADE.FOMO: “Strong recent movement makes waiting irrational.”

Evidence: scenario decision + rationale + changed-evidence reassessment.

## Cross-cutting X.PROCESS_OVER_OUTCOME

Objective:
Evaluate decision quality using information and process available at decision time rather than later market luck.

Misconceptions:
- M.PROCESS.WINRIGHT: “Profit proves the decision was correct.”
- M.PROCESS.LOSSWRONG: “Loss proves the decision was wrong.”
- M.PROCESS.HINDSIGHT: “Known later information should have been obvious earlier.”

This concept must appear in Arena feedback, journal review and graduation transfer.

## Authoring rules

- Misconception IDs are stable once authoritative evidence references them.
- Learner-facing feedback may be localized/reworded, but the misconception identity remains stable.
- Do not infer a misconception solely from one wrong answer when multiple reasoning paths are plausible.
- Confidence mismatch may increase diagnostic priority but does not itself prove a misconception.
- AI may propose a misconception label; governed scoring/diagnosis requires validated evidence and policy.

Next: encode these registries in typed data and add topology, stable-ID, prerequisite-cycle and FA/EN parity tests.

No merge or deployment is authorized by this registry.
