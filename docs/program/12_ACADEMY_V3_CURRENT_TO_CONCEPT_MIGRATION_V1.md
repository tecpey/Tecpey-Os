# TecPey Academy V3 — Current-to-Concept Migration V1

Status: Phase 1 migration authority
Date: 2026-09-25
Parent: 11_ACADEMY_V3_CONCEPT_INVENTORY_V1.md

## Decision vocabulary

- KEEP: concept and lesson grain are suitable; rewrite may still improve evidence/provenance.
- REWRITE: concept grain is useful but instructional design/content must be rebuilt.
- SPLIT: current lesson contains multiple concepts that require separate governed identities.
- MERGE: current lesson overlaps another lesson and should become one coherent concept/mission.
- RETIRE: content should not remain a canonical lesson; historical evidence remains immutable.

This mapping is semantic, not a destructive migration. Existing item/content IDs remain valid for historical evidence.

## Term 1

| Current lesson | V3 concept(s) | Decision | Reason |
|---|---|---|---|
| پول، اعتماد و مسئله واسطه | T1.MONEY_TRUST, T1.FOUNDATIONAL_RISK | SPLIT | Money/trust mental model and irreversible-risk behavior need distinct objectives/evidence. |
| بیت‌کوین چرا به وجود آمد؟ | T1.BITCOIN_MODEL | REWRITE | Preserve purpose/scarcity but strengthen uncertainty, limitations and source precision. |
| بلاکچین به زبان ساده | T1.BLOCKCHAIN_MODEL | REWRITE | Replace analogy-heavy treatment with accurate ledger/consensus boundaries and counterexamples. |
| اتریوم، قرارداد هوشمند، کوین و توکن | T1.ETH_SMART_CONTRACTS | SPLIT | Platform/smart-contract model and coin/token taxonomy should not share one assessment identity. |
| استیبل‌کوین‌ها؛ تتر، کاربرد و ریسک | T1.STABLECOINS | REWRITE | Safety-critical; issuer, depeg, freeze and network risks require provenance/freshness. |
| قیمت، ارزش بازار و نقدشوندگی | T1.MARKET_VOCAB | SPLIT | Market cap/supply and liquidity/executability are different mental models. |

## Term 2

| Current lesson | V3 concept(s) | Decision | Reason |
|---|---|---|---|
| امنیت یک زنجیره است، نه یک دکمه | T2.AUTH_SECURITY, T2.MALWARE_DEVICE | SPLIT | Account chain and device threat model need separate remediation paths. |
| رمز عبور، مدیریت رمز و 2FA | T2.AUTH_SECURITY | REWRITE | Preserve core; add recovery/session/passkey/TOTP policy-aware scenarios without platform-specific assumptions. |
| Seed Phrase و کیف پول غیرامانی | T2.SEED_RECOVERY | REWRITE | Critical concept needs compromise-response and irreversible-authority scenarios. |
| کیف پول گرم، سرد، امانی و غیرامانی | T2.CUSTODY_MODELS | REWRITE | Teach trade-offs and responsibility rather than “cold always best”. |
| فیشینگ و پیام‌های فوری | T2.PHISHING_SOCIAL | REWRITE | Build adversarial scenarios around urgency, impersonation and domain/app verification. |
| بدافزار، کلیپ‌بورد و خطای انتقال | T2.MALWARE_DEVICE, T2.TRANSFER_SAFETY | SPLIT | Device compromise and transfer verification are separate failure classes. |
| transfer/network safety material | T2.TRANSFER_SAFETY | MERGE | Consolidate duplicated network/address/memo checks into one governed checklist + transfer scenario family. |

Gap to author explicitly: T2.APPROVAL_RISK and T2.INCIDENT_RESPONSE require dedicated V3 missions if current inventory lacks sufficient depth.

## Term 3

| Current lesson | V3 concept(s) | Decision | Reason |
|---|---|---|---|
| What an exchange does | T3.EXCHANGE_MODEL | REWRITE | Clarify custody, execution venue and education/risk boundaries. |
| Market and limit orders | T3.ORDER_TYPES | REWRITE | Scenario-based execution trade-offs rather than definitions only. |
| Stop, stop-limit and OCO | T3.ORDER_TYPES, T3.EXECUTION_DISCIPLINE | SPLIT | Mechanics and decision discipline require different evidence. |
| Spread, slippage and depth | T3.ORDERBOOK_LIQUIDITY, T3.SPREAD_SLIPPAGE | SPLIT | Liquidity model is prerequisite to slippage reasoning. |
| Deposits, withdrawals and networks | T3.DEPOSIT_WITHDRAW | REWRITE | Critical transfer mission should reuse Term 2 safety prerequisites without duplicating authority. |
| Real trading cost | T3.EXECUTION_COST | REWRITE | Add executable-price scenarios and cost decomposition. |

Gap: explicit no-rush/no-action execution discipline should become a governed mission rather than coaching copy.

## Term 4

Current Term 4 content already contains useful research primitives but commonly bundles multiple claims into prose-first lessons.

- “From claim to real utility” -> T4.UTILITY_EVIDENCE — REWRITE.
- “Team, whitepaper and roadmap” -> T4.TEAM_GOVERNANCE + T4.SOURCE_VERIFICATION — SPLIT.
- “Tokenomics, supply and FDV” -> T4.TOKEN_SUPPLY + T4.VESTING_UNLOCKS + T4.VALUATION_CONTEXT — SPLIT.
- “TVL, revenue and market data” -> T4.PROTOCOL_METRICS + T4.SOURCE_VERIFICATION — SPLIT.
- “Project red flags” -> T4.RED_FLAGS + T4.LIQUIDITY_CONCENTRATION — SPLIT where concentration/liquidity evidence is currently mixed with generic warnings.

Every mutable metric/example requires provenance and freshness. “Large number = quality” becomes an explicit misconception.

## Term 5

Current analysis material should be decomposed by reasoning skill rather than indicator catalogue.

- trend/market structure -> T5.PRICE_STRUCTURE — REWRITE.
- support/resistance -> T5.SUPPORT_RESISTANCE — REWRITE.
- volume -> T5.VOLUME_CONTEXT — REWRITE.
- indicators -> T5.INDICATOR_LIMITS — REWRITE; indicators must not be taught as prediction authority.
- combined analysis -> T5.MULTI_SIGNAL_REASONING — REWRITE.
- timeframe material -> T5.TIMEFRAME_CONTEXT — REWRITE.
- false breakout/invalidation material -> T5.INVALIDATION — SPLIT if currently bundled.
- certainty/prediction language -> T5.ANALYSIS_UNCERTAINTY — AUTHOR as explicit cross-cutting mission if absent.

## Term 6

The current Term 6 is strong on basic capital protection but mixes risk mathematics and behavior incompletely.

| Current lesson | V3 concept(s) | Decision |
|---|---|---|
| What risk really means | T6.RISK_BUDGET, T6.DRAWDOWN | SPLIT |
| Position size and risk per trade | T6.POSITION_SIZING | REWRITE |
| Stop loss and invalidation | T5.INVALIDATION, T6.POSITION_SIZING | MERGE/SPLIT across prerequisite boundary |
| DCA and staged investing | T6.RISK_BUDGET | REWRITE; retain only with objective-specific evidence and limitations |
| Portfolio allocation | T6.CORRELATION, T6.RISK_BUDGET | SPLIT |
| Drawdown and survival | T6.DRAWDOWN, T6.REVENGE | SPLIT |

Gaps to author: T6.EXPECTANCY, T6.FOMO, T6.OVERCONFIDENCE, T6.CONFIRMATION_BIAS, T6.NO_TRADE and T6.DECISION_JOURNAL are required by V3. Psychology currently concentrated in Term 7 should move earlier where it affects risk decisions.

## Term 7

Current Term 7 is primarily psychology/readiness. V3 changes Term 7 into integrated professional practice, so this is the largest topology migration.

| Current lesson | V3 destination | Decision |
|---|---|---|
| FOMO and greed | T6.FOMO, T6.OVERCONFIDENCE | MOVE/REWRITE into Term 6 |
| Fear and panic selling | T6.RISK_BUDGET, T6.DECISION_JOURNAL | MOVE/SPLIT |
| Revenge trading and overtrading | T6.REVENGE, T6.NO_TRADE | MOVE/REWRITE |
| Decision journal | T6.DECISION_JOURNAL + T7.JOURNAL_REVIEW | SPLIT |
| Final entry checklist | T7.PLAN_CONSTRUCTION, T7.SECURITY_REVIEW | REWRITE |
| Am I ready for the market? | T7.GRADUATION_TRANSFER | REWRITE |

New Term 7 missions must be authored for T7.RESEARCH_WORKFLOW, T7.SCENARIO_PORTFOLIO, T7.EXECUTION_REVIEW, T7.EVIDENCE_COMMUNICATION and T7.ARENA_TRANSFER.

## High-priority content gaps discovered

1. Incident response after account/wallet compromise.
2. Wallet/contract approval risk and revocation reasoning.
3. Expectancy and repeated-decision mathematics.
4. Correlation and hidden concentration.
5. Explicit no-trade competence.
6. Confidence calibration and disconfirming evidence.
7. Process-versus-outcome evaluation.
8. Integrated research-to-risk plan.
9. Changed-context graduation transfer.
10. Explicit source provenance/freshness behavior.

## Migration safety

- No historical assessment is rewritten to a new concept/version in place.
- Moving a lesson between terms does not mutate prior evidence identity.
- New V3 items receive new stable IDs/versions.
- Retired content remains readable for audit where required but cannot generate new authoritative evidence.
- FA and EN migrate against the same concept topology even when wording differs.
- The runtime must not consume this document as authority until machine-readable registries and validators are implemented.

## Next gate

Build the Objective Registry and Misconception Registry for safety-critical concepts first, then encode the concept/prerequisite graph in machine-readable data with cycle/parity tests.

No merge or deployment is authorized by this mapping.
