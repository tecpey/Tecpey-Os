# TecPey Official Journal-Reflection Challenge Authority

Issue: #216  
Parent: #160  
Depends on: #214

## Purpose

This authority promotes exactly one Community challenge—`journal-reflection-week`—from preview content to an official, server-authoritative Academy/Arena outcome.

The implementation does not activate scenario, stop-loss, streak, leaderboard, scholarship, real-money or Instructor outcomes. Those remain unavailable until each domain has complete server evidence and its own reviewed authority.

## Deterministic challenge cycle

`src/lib/community-challenges.ts` is a pure catalogue and UTC cycle calculator. It owns no participation, completion, score, XP or badge state.

- cycle origin: January 1 at 00:00:00 UTC for each year;
- cycle duration: seven days;
- cycle key: `YYYY-cycle-NN`;
- catalogue selection: cycle number modulo the catalogue length;
- client and server use the same pure cycle function;
- invalid dates fail explicitly.

This is a TecPey challenge cycle, not a locale-dependent browser week.

## Official eligibility

A learner is eligible only when all conditions are true for the active cycle:

1. the active catalogue challenge is `journal-reflection-week`;
2. the canonical Community profile has `challenge_participation = TRUE`;
3. at least three distinct canonical Arena trades were closed inside the cycle window;
4. at least 80% of those closed trades have a canonical Reflection bound to the same student, attempt and closed-trade identifier;
5. no reward for the same challenge cycle already exists.

The minimum of three trades is an anti-gaming hardening over the previous preview wording. Raw profit, loss, balance, position size and browser state are irrelevant to eligibility.

## Closed-trade denominator

The denominator is derived from append-only `academy_trading_arena_execution_events`:

- manual close: `arena.position_closed` using `payload.trade.id` and the trade close timestamp;
- automatic stop-loss/take-profit during refresh: `arena.market_refreshed` using `payload.closedTradeIds` and the committed event timestamp;
- automatic close during limit-order fill: `arena.limit_order_filled` using `payload.autoClosedTradeIds` and the committed event timestamp.

Rows are deduplicated by `(attempt_id, student_id, trade_id)` and bounded to the server cycle window.

## Reflection numerator

The numerator joins `academy_trading_arena_reflections` on:

- `student_id`;
- `attempt_id`;
- `closed_trade_id`.

The client cannot submit counts, trade identifiers, score, completion, XP, badge or timestamps to the authority.

## Consent

Participation is controlled only through the revisioned Community profile consent mutation. It defaults to off and is stored under the canonical tenant/workspace/principal binding.

Consent and challenge status are separate reads. If status calculation is unavailable, the account-owned consent switch remains available so the learner can disable future claims.

## Claim transaction

The claim mutation runs in one PostgreSQL transaction and uses:

- strict canonical session and verified tenant/workspace/student principal context;
- CSRF origin validation;
- bounded exact-body parsing;
- mandatory idempotency key;
- principal/week advisory serialization;
- idempotency advisory serialization;
- immutable Academy learning command replay evidence;
- current-cycle and current-challenge verification;
- a unique `academy_reward_ledger` reward key;
- one `community_challenge_completed` student event;
- one mandatory `community.challenge.reward.claim` audit event;
- immediate Academy progress/cartax projection refresh.

## Exactly-once reward

Reward key:

`challenge:journal-reflection:<weekKey>`

Reward:

- 200 XP;
- badge `journal-master`.

The reward ledger unique constraint is the final database-level duplicate barrier. Exact replay returns the committed response. Reusing the same idempotency key with a changed request returns an explicit conflict. Concurrent claim identities serialize and produce one reward, event and audit record.

## HTTP contract

The existing governed Community Route Handler is reused:

- `GET /api/community/profile?view=challenge-center`
  - strict session;
  - scope `community:challenge:read`;
  - private/no-store and `Vary: Cookie`;
  - truthful status or explicit unavailability.

- `PATCH /api/community/profile?view=journal-challenge`
  - strict session and CSRF;
  - scope `community:challenge:write`;
  - exact body: `challengeId`, `weekKey`;
  - mandatory idempotency key;
  - explicit inactive, consent, eligibility, conflict and unavailable errors.

No new Route Handler file is created solely for this operation; API Manifest evolution is recorded through the reviewed delta chain for Issue #216.

## Client boundary

The client parser validates:

- exact challenge identity and cycle-key shape;
- valid ordered timestamps;
- non-negative bounded counts;
- reflected count not greater than closed count;
- mathematically exact reflection rate and rounded score;
- fixed minimums and fixed reward;
- completion consistency with `rewardedAt`;
- valid claim wrapper and progress revision.

Malformed or inconsistent responses are rejected rather than rendered.

## Fail-closed residual scope

The following remain preview-only or disabled:

- beginner scenario completion;
- stop-loss-rate challenge;
- FOMO scenario completion;
- news-reaction scenario completion;
- Academy streak challenge;
- Community leaderboard/reputation;
- Instructor review/grant access;
- scholarships, funded accounts and real-money rewards.
