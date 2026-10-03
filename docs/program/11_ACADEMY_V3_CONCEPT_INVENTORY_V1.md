# TecPey Academy V3 — Concept Inventory V1

Status: Phase 1 working authority
Date: 2026-09-25
Parent: 10_ACADEMY_V3_CURRICULUM_REBUILD_SPEC.md

## Purpose

This inventory establishes the first stable concept taxonomy for rebuilding the seven core terms. It is intentionally concept-level: lesson prose, UI cards and quiz wording are downstream representations and may change without changing concept identity.

Safety labels:
- C = critical: mistakes can materially increase security or financial risk.
- I = important: mistakes can degrade decision quality.
- S = standard foundational competence.

## Term 1 — Foundations and Safe Participation

- T1.MONEY_TRUST [I] — functions of money, trust and intermediaries.
- T1.CRYPTO_PRIMITIVES [I] — digital scarcity, signatures, distributed verification and limitations.
- T1.BLOCKCHAIN_MODEL [I] — ledger/consensus mental model; blockchain is infrastructure, not proof of project quality.
- T1.BITCOIN_MODEL [I] — Bitcoin purpose, supply properties, network model, volatility and uncertainty.
- T1.ETH_SMART_CONTRACTS [I] — Ethereum, smart contracts, coins vs tokens and contract risk.
- T1.STABLECOINS [C] — peg model, issuer/counterparty, freeze, depeg and network risk.
- T1.MARKET_VOCAB [I] — price, market cap, supply, liquidity, volume and volatility.
- T1.FOUNDATIONAL_RISK [C] — uncertainty, irreversible actions, loss tolerance and safe first participation.

## Term 2 — Security, Custody and Operational Safety

- T2.AUTH_SECURITY [C] — unique credentials, MFA, recovery and account takeover boundaries.
- T2.SEED_RECOVERY [C] — recovery phrase authority, offline handling, compromise response.
- T2.CUSTODY_MODELS [C] — custodial/non-custodial and hot/cold trade-offs.
- T2.PHISHING_SOCIAL [C] — urgency, impersonation, fake domains/apps/support.
- T2.MALWARE_DEVICE [C] — clipboard, extensions, device compromise and verification.
- T2.TRANSFER_SAFETY [C] — asset/network/address/memo/tag/fee/destination verification.
- T2.APPROVAL_RISK [C] — wallet connections, permissions and contract approvals.
- T2.INCIDENT_RESPONSE [C] — containment, credential rotation, wallet migration and evidence preservation.

## Term 3 — Market Mechanics and Execution

- T3.EXCHANGE_MODEL [I] — what an exchange does and does not do.
- T3.ORDER_TYPES [I] — market, limit and conditional order trade-offs.
- T3.ORDERBOOK_LIQUIDITY [I] — bids/asks, depth and liquidity.
- T3.SPREAD_SLIPPAGE [I] — expected versus executable price.
- T3.EXECUTION_COST [I] — fees, spread, slippage, withdrawal/network cost.
- T3.DEPOSIT_WITHDRAW [C] — operational transfer safety in exchange flows.
- T3.EXECUTION_DISCIPLINE [C] — pre-trade checks, avoiding urgency and choosing no-action where appropriate.

## Term 4 — Research, Tokenomics and Evidence

- T4.UTILITY_EVIDENCE [I] — distinguish claims from measurable utility.
- T4.TEAM_GOVERNANCE [I] — team, code, governance, documentation and execution evidence.
- T4.TOKEN_SUPPLY [I] — circulating/total/max supply and dilution.
- T4.VESTING_UNLOCKS [I] — unlock schedules and incentive/supply pressure.
- T4.VALUATION_CONTEXT [I] — market cap, FDV and limitations.
- T4.PROTOCOL_METRICS [I] — TVL, fees, revenue, users and metric limitations.
- T4.LIQUIDITY_CONCENTRATION [C] — liquidity and ownership concentration risks.
- T4.SOURCE_VERIFICATION [C] — provenance, corroboration, recency and conflicts.
- T4.RED_FLAGS [C] — guarantees, unverifiable claims, artificial communities and structural warnings.

## Term 5 — Market Analysis and Invalidation

- T5.PRICE_STRUCTURE [I] — trend, range, swing structure and context.
- T5.SUPPORT_RESISTANCE [I] — zones and uncertainty rather than magical lines.
- T5.VOLUME_CONTEXT [I] — volume interpretation and limitations.
- T5.INDICATOR_LIMITS [I] — indicators as transformations, not predictive truth.
- T5.MULTI_SIGNAL_REASONING [I] — combine evidence without double-counting correlated signals.
- T5.TIMEFRAME_CONTEXT [I] — timeframe dependence and horizon consistency.
- T5.INVALIDATION [C] — define what evidence makes a thesis wrong.
- T5.ANALYSIS_UNCERTAINTY [C] — scenario thinking, confidence calibration and no certainty language.

## Term 6 — Risk, Decision Psychology and Process

- T6.POSITION_SIZING [C] — size from risk budget/invalidation rather than conviction alone.
- T6.EXPECTANCY [C] — probability, payoff and repeated-decision thinking.
- T6.DRAWDOWN [C] — compounding loss, recovery asymmetry and loss boundaries.
- T6.CORRELATION [C] — hidden concentration and diversification limits.
- T6.RISK_BUDGET [C] — bounded exposure and portfolio-level constraints.
- T6.FOMO [C] — urgency/chasing and precommitment.
- T6.REVENGE [C] — loss-triggered escalation and recovery protocol.
- T6.OVERCONFIDENCE [C] — confidence/evidence mismatch.
- T6.CONFIRMATION_BIAS [I] — seek disconfirming evidence.
- T6.NO_TRADE [C] — no-action as a valid disciplined decision.
- T6.DECISION_JOURNAL [I] — record thesis, evidence, invalidation, risk and later review.

## Term 7 — Integrated Professional Practice

- T7.RESEARCH_WORKFLOW [I] — repeatable evidence-first research process.
- T7.PLAN_CONSTRUCTION [C] — objective, entry conditions, invalidation, sizing and exit/risk plan.
- T7.SCENARIO_PORTFOLIO [C] — integrated portfolio/risk decisions under uncertainty.
- T7.SECURITY_REVIEW [C] — operational security audit before consequential action.
- T7.EXECUTION_REVIEW [I] — process quality separate from outcome luck.
- T7.JOURNAL_REVIEW [I] — detect repeated reasoning and discipline patterns.
- T7.EVIDENCE_COMMUNICATION [I] — explain decision, uncertainty and limitations.
- T7.ARENA_TRANSFER [C] — demonstrate process under simulated changing conditions.
- T7.GRADUATION_TRANSFER [C] — integrated changed-context assessment before foundation graduation.

## Cross-term concepts

These should be reinforced across terms rather than owned by a single lesson:

- X.UNCERTAINTY [C]
- X.PROVENANCE [C]
- X.CONFIDENCE_CALIBRATION [I]
- X.NO_ACTION_OPTION [C]
- X.PROCESS_OVER_OUTCOME [C]
- X.RISK_FIRST [C]
- X.EXPLAINABLE_REASONING [I]
- X.REVERSIBILITY [C]

## First prerequisite spine

- T1.FOUNDATIONAL_RISK -> T2 security concepts and T3 execution discipline.
- T1.MARKET_VOCAB -> T3 market mechanics and T4 valuation context.
- T2.TRANSFER_SAFETY -> T3.DEPOSIT_WITHDRAW.
- T3.ORDERBOOK_LIQUIDITY -> T3.SPREAD_SLIPPAGE -> T3.EXECUTION_COST.
- T4.SOURCE_VERIFICATION -> T5.MULTI_SIGNAL_REASONING.
- T5.INVALIDATION -> T6.POSITION_SIZING.
- T6.RISK_BUDGET + T6.NO_TRADE + T6.DECISION_JOURNAL -> T7.PLAN_CONSTRUCTION.
- T7 integrated concepts -> Term 8 governed adaptive transfer.

This is only the first spine. The machine-readable graph must validate cycles before it becomes runtime authority.

## Migration rule

Existing lessons are not deleted because this taxonomy exists. The next artifact maps each current FA/EN lesson to one or more stable concept IDs and assigns keep/rewrite/split/merge/retire. That mapping is the gate before mass curriculum replacement.

No merge or deployment is authorized by this inventory.
