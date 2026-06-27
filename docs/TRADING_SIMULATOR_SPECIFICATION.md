# TecPey Academy — Trading Simulator Specification

**Phase 14 Strategic Document → Phase 17 Implementation Complete**
**Version:** 2.0
**Date:** 2026-06-27
**Status:** Production (Phase 17 shipped)

---

## Phase 17 Implementation Summary

### What was built

| File | Purpose |
|---|---|
| `src/lib/trading-arena.ts` | Core paper-trading engine — wallet, orders, positions, PnL, fees, slippage, SL/TP |
| `src/lib/trading-scenarios.ts` | 6 deterministic guided scenarios (FOMO, Revenge, Volatility, Risk Management, News Reaction, Beginner) |
| `src/lib/trading-journal.ts` | Trade journal — pre-entry plan, post-trade reflection, mistake tags |
| `src/lib/trading-dna.ts` | Trading DNA signal extraction and blending with behavioral engine |
| `src/lib/behavioral-engine.ts` | Updated — now consumes trading DNA signals in 7 dimension scorers |
| `src/components/academy/trading-arena/TradingArenaDashboard.tsx` | Main arena — balance, portfolio, buy/sell panel, positions, history, mentor flags |
| `src/components/academy/trading-arena/ScenarioPlayer.tsx` | Full scenario experience — briefing → trading → result with mentor feedback |
| `src/components/academy/trading-arena/JournalView.tsx` | Journal UI — pre/post forms, mistake tag pattern analysis |
| `src/app/academy/trading-arena/page.tsx` | Route: `/academy/trading-arena` |
| `src/app/academy/trading-arena/scenarios/page.tsx` | Route: `/academy/trading-arena/scenarios` |
| `src/app/academy/trading-arena/journal/page.tsx` | Route: `/academy/trading-arena/journal` |

### Technical decisions

- **Client-side only** — no database, no API calls. Works offline from day one.
- **Fees:** 0.1% per side (maker + taker, Binance-standard simplification)
- **Slippage:** 0–0.05% random on market orders only
- **Simulated prices:** Random walk ±0.12%/tick (2s interval) in main arena; deterministic LCG sequences in scenarios
- **Limit orders:** Checked against each price tick, filled immediately on cross
- **SL/TP:** Checked on every price tick via `processPriceTick()`
- **localStorage keys:** `tecpey-trading-arena`, `tecpey-trading-journal`
- **Safety gate:** Max risk 20% hard reject; 5% threshold triggers warning

### Scenario system

6 scenarios, ordered by difficulty (2 beginner, 3 intermediate, 1 advanced):

| ID | Concept | Success Criteria |
|---|---|---|
| `beginner-btc` | Interface basics + stop loss | Any profitable trade with SL |
| `volatility` | Patience through swings | Hold through a dip with SL |
| `fomo-scenario` | FOMO resistance | Make zero trades (best outcome: watch and wait) |
| `revenge-trading` | Revenge trading control | Avoid revenge trade after initial loss |
| `risk-management` | Stop-loss discipline | Every trade has SL set |
| `news-reaction` | News awareness | Stay above -8% after news event |

### Mentor flags

Every trade gets behavioral flags at open time: `no-stop-loss`, `over-risk`, `impulse-entry`, `revenge-trade`, `good-discipline`, `proper-sizing`, `target-hit`, `fomo-entry`

These flags:
1. Show in the arena dashboard as mentor warnings
2. Feed into `computeArenaStats()` to produce rates
3. Flow into `trading-dna.ts` which feeds `behavioral-engine.ts`

---

## Overview

The TecPey Trading Arena (شبیه‌ساز معاملاتی تک‌پی) is the practice environment where Academy theory becomes applied skill. It is not a toy — it is a professional-grade simulation that mirrors real market conditions without financial risk.

The Trading Arena is the most important technical investment in TecPey Academy. It is where learning becomes behavior.

---

## Part 1 — Design Philosophy

### 1.1 Core Principles

**Realistic, not simplified.**
The simulator must accurately reflect real market conditions: real spreads, real slippage, real order fills, real market impact concepts. Simulated profits earned on unrealistic conditions create false confidence.

**Education-first, not entertainment-first.**
The goal is skill development, not engagement. Every simulator session should produce a learning artifact: a journal entry, a behavioral analysis, a completed exercise.

**Linked to curriculum.**
Every simulator session at the Academy level ties to a module. Students are not free-trading in a sandbox — they are practicing specific skills taught in the curriculum.

**Psychology-forward.**
The simulator captures behavioral data at every decision point. Not just P&L — but why, when, how, under what emotional state.

### 1.2 What the Trading Arena Is Not

- Not a social trading platform
- Not a competition leaderboard for entertainment
- Not a demo account that users ignore
- Not a replacement for live trading experience

---

## Part 2 — Market Data

### 2.1 Live Price Feed
The simulator uses real-time price data from TecPey's market data infrastructure. Students trade against real bid/ask spreads.

### 2.2 Supported Asset Classes
| Asset Class | Phase 1 | Phase 2 |
|-------------|---------|---------|
| Spot crypto (BTC, ETH, top 50) | ✓ | ✓ |
| Stablecoins (USDT, USDC) | ✓ | ✓ |
| Perpetual futures (BTC, ETH) | ✗ | ✓ |
| Derivatives (options) | ✗ | ✓ (Phase 3) |

### 2.3 Simulated Account
- Starting balance: 10,000 USDT equivalent (virtual)
- Students may reset their account once per calendar month (not per session)
- Account reset is logged — patterns of resetting are flagged for AI Mentor review
- Minimum reset wait: 30 days

### 2.4 Realistic Market Mechanics
- Bid-ask spread applied to all fills
- Market orders filled at ask (buy) or bid (sell) — no mid-price fills
- Slippage applied for large simulated orders relative to simulated liquidity
- Limit orders placed in order book; filled when price reaches level
- Partial fills modeled for thin simulated markets

---

## Part 3 — Order Types

All order types taught in the Academy curriculum are available in the simulator. Simulator always introduces new order types in sync with curriculum — not ahead of it.

| Order Type | Available From |
|------------|--------------|
| Market Order | Term 1, Module 5 |
| Limit Order | Term 1, Module 5 |
| Stop-Market Order | Term 4, Module 3 |
| Stop-Limit Order | Term 4, Module 3 |
| Take-Profit Limit | Term 4, Module 3 |
| Conditional (OCO) | Term 6 |

---

## Part 4 — Portfolio

### 4.1 Portfolio View

```
┌─────────────────────────────────────────────────────┐
│  Trading Arena — Portfolio                           │
│  Balance: 10,000 USDT    P&L: +$240 (+2.4%)         │
├─────────────────────────────────────────────────────┤
│  Open Positions:                                     │
│  BTC/USDT   Long   0.05 BTC   Entry: $67,200        │
│                               Current: $68,100      │
│                               P&L: +$45 (+1.34%)    │
│  ETH/USDT   Long   0.8 ETH    Entry: $3,100         │
│                               Current: $3,050       │
│                               P&L: -$40 (-1.6%)     │
├─────────────────────────────────────────────────────┤
│  Risk Exposure:  12.5% of account                   │
│  Max Position:   10% (your rule: 10%)               │
│  ⚠ ETH position exceeds your 10% rule — Review     │
├─────────────────────────────────────────────────────┤
│  Historical P&L:  ████████░░  Week: +4.2%          │
│  Drawdown:        Max 8.1% this month               │
└─────────────────────────────────────────────────────┘
```

### 4.2 Portfolio Rules Check

The portfolio view actively compares positions against the student's Trading Rulebook (defined in Term 5). Any rule violation triggers a warning — not a block, but a visible prompt to reflect.

---

## Part 5 — Trade Journal

### 5.1 Mandatory Journal Structure

Every trade in the simulator generates a Journal Entry. Students must complete the journal to earn the trade's credit toward curriculum requirements.

**Pre-Trade Entry (before order placement):**
```
┌─────────────────────────────────────────────────────┐
│  Pre-Trade Journal                                   │
│  ─────────────────────────────────────────────────  │
│  Asset: BTC/USDT                                     │
│  Direction: Long / Short                            │
│  Setup Type: [Dropdown: Trend continuation, Breakout,│
│               Support bounce, Reversal, Other]       │
│  Timeframe: [1H / 4H / 1D / Other]                  │
│  Entry rationale (min 20 words):                    │
│  [text area]                                        │
│  Emotional state: [Calm / Uncertain / Excited /     │
│                    Anxious / Confident / Other]      │
│  Rule compliance: Does this trade comply with all   │
│  rules in my rulebook? [Yes / No / Partial]         │
│                                                      │
│  [ Proceed to Order → ]                              │
└─────────────────────────────────────────────────────┘
```

**Post-Trade Entry (after trade closed):**
```
┌─────────────────────────────────────────────────────┐
│  Post-Trade Review                                   │
│  ─────────────────────────────────────────────────  │
│  Result: Win / Loss / Breakeven                     │
│  P&L: +$45 (+1.3%)                                 │
│  Emotional state at exit: [same options as above]   │
│  Did setup play out as expected? [Yes / No / Mixed] │
│  What I did well:                                   │
│  [text area]                                        │
│  What I would do differently:                       │
│  [text area]                                        │
│  Rule violations during trade: [Yes / No]           │
│  If yes, describe:                                  │
│  [text area]                                        │
│  AI Mentor Review: [ Request review → ]             │
└─────────────────────────────────────────────────────┘
```

### 5.2 Journal Analytics

The Journal aggregates into analytics visible in the student dashboard:
- Win rate by setup type
- Average R:R by setup type
- Emotional state vs outcome correlation
- Rule compliance rate
- Most common mistakes (extracted from post-trade text)
- Behavioral pattern flags from AI analysis

---

## Part 6 — Risk Metrics

The simulator calculates and displays the following metrics, with explanations accessible via glossary tooltip:

| Metric | Update Frequency | Explanation Tooltip |
|--------|-----------------|---------------------|
| Total P&L (amount) | Real-time | ✓ |
| Total P&L (%) | Real-time | ✓ |
| Current drawdown | Real-time | ✓ |
| Maximum drawdown (session) | End of session | ✓ |
| Maximum drawdown (30-day) | Daily | ✓ |
| Win rate | Per 20 trades minimum | ✓ |
| Average winner / Average loser | Per 20 trades | ✓ |
| Profit factor | Per 20 trades | ✓ |
| Expectancy | Per 20 trades | ✓ |
| Risk per trade (avg) | Real-time | ✓ |
| Max consecutive losses | Weekly | ✓ |
| Rule compliance rate | Per session | ✓ |

---

## Part 7 — Trade Review

### 7.1 Per-Trade Review

Each trade can be reviewed post-close with:
- Full price chart from entry to exit with entry/exit markers
- Trade duration
- Maximum adverse excursion (how far against the position went)
- Maximum favorable excursion (best point before exit)
- P&L comparison: actual vs if taken at MAE point / MFE point
- Journal entry attached

### 7.2 AI Trade Review

Students can request an AI review of any completed trade. The AI Mentor:
1. Reads the pre-trade and post-trade journal entries
2. Analyzes the chart from the trade period
3. Assesses rule compliance
4. Asks 1–2 Socratic questions about the trade decision
5. Does NOT say whether it was a "good" trade — asks the student to evaluate

---

## Part 8 — Scenario Training

### 8.1 Structured Scenarios

Beyond free trading, the Academy provides structured scenario training — historical market situations that students must navigate.

**Scenario Types:**
- **Market crash scenario:** Navigate a 30% market drop over 5 days. Objective: protect capital, not make profit.
- **Manipulation scenario:** Identify and avoid a pump-and-dump setup from in-scenario signals.
- **News event scenario:** A major regulatory announcement drops during a position. Decision required.
- **Liquidation pressure scenario:** Position moving against you. When do you cut? When do you hold?
- **FOMO scenario:** Asset rallied 40%. You missed it. Temptation scenario with structured decision points.
- **Revenge trading scenario:** You just lost 3 trades. Trigger conditions for revenge trade are active. Recognition and pause required.

**Each scenario includes:**
- Historical context (anonymized to prevent "I know this story" bias)
- Decision points with forced choice
- Post-scenario debrief with psychological analysis
- Score out of 100

### 8.2 Scenario Library

- Minimum 20 scenarios at launch
- 5 new scenarios added per quarter
- Scenarios are curriculum-gated (advanced scenarios unlock with term completion)

---

## Part 9 — Market Challenges

### 9.1 Monthly Challenge

Every month, TecPey Academy publishes a market challenge:
- Fixed starting capital (same for all participants)
- Fixed time period (same real-time market, all participants live)
- Defined objective (e.g., "Minimize drawdown this month", "Achieve positive expectancy over 20 trades")
- Evaluation based on risk-adjusted metrics, not P&L alone

**Challenge Types:**
- Capital preservation challenge (minimize drawdown)
- Consistency challenge (maintain win rate > 55% over 20 trades)
- Discipline challenge (0 rule violations in 30 trades)
- Recovery challenge (recover from a simulated -20% start)

### 9.2 Challenge Evaluation

Challenges are NOT won by highest profit. They are scored on:
- Risk management adherence (40%)
- Journal completion rate (20%)
- Rule compliance rate (20%)
- Behavioral consistency (20%)

This design is intentional — it rewards disciplined trading, not lucky outcomes.

---

## Part 10 — Leaderboard

### 10.1 Leaderboard Philosophy

The leaderboard is an accountability tool, not a competition. It ranks students on composite discipline scores, not P&L.

### 10.2 Leaderboard Scoring

```
Composite Discipline Score = 
  (Rule Compliance Rate × 0.35) +
  (Journal Completion Rate × 0.25) +
  (Risk Management Score × 0.25) +
  (Behavioral Consistency × 0.15)
```

### 10.3 Leaderboard Tiers

| Tier | Score Range | Badge |
|------|------------|-------|
| Apprentice | 0–49 | Gray |
| Practitioner | 50–69 | Bronze |
| Disciplined | 70–84 | Silver |
| Expert | 85–94 | Gold |
| Professional | 95–100 | Platinum |

### 10.4 Privacy

- Leaderboard participation is opt-in
- Default: visible to enrolled Academy students only, not public
- Students can use a pseudonym

---

## Part 11 — Replay Mode

### 11.1 What is Replay Mode?

Replay Mode allows students to re-enter any historical market period and make decisions as if they were live — without knowing the future.

**Use cases:**
- Relive a major market event (COVID crash, FTX collapse, Bitcoin halving)
- Practice a specific setup type on historical data
- Test their strategy on 6 months of data in 30 minutes

### 11.2 Replay Controls

- Speed: 1x (one candle per real minute), 5x, 10x, 50x
- Pause and add notes
- Full order execution at historical prices
- Journal completion required at end of session

### 11.3 Curriculum Integration

Specific replay sessions are assigned as curriculum exercises:
- "Replay the March 2020 crash: how do you manage a long position?"
- "Replay a 2023 altcoin season: identify when momentum turns"

---

## Part 12 — Performance Analytics

### 12.1 Analytics Dashboard

```
┌───────────────────────────────────────────────────────┐
│  Your Trading Analytics — Last 90 Days               │
├──────────────┬──────────────┬──────────────┬──────────┤
│  Total       │  Win Rate    │  Profit      │  Max DD  │
│  Trades: 87  │  52%         │  Factor: 1.3 │  -14.2%  │
├──────────────┴──────────────┴──────────────┴──────────┤
│  Performance by Setup Type:                           │
│  ● Support bounce   WR: 61%  PF: 1.6  Avg R: +0.8R  │
│  ● Trend follow     WR: 48%  PF: 1.1  Avg R: +0.2R  │
│  ● Breakout         WR: 38%  PF: 0.9  Avg R: -0.3R  │
│                                                       │
│  AI Insight: Your breakout trades consistently       │
│  underperform. Consider reviewing your entry         │
│  criteria for this setup.                            │
├───────────────────────────────────────────────────────┤
│  Behavioral Analytics:                                │
│  ● Rule compliance: 78%                              │
│  ● Most common violation: "Oversized position" (8x) │
│  ● Emotional pattern: Win rate drops 18% after       │
│    a losing trade (revenge trading signal)           │
└───────────────────────────────────────────────────────┘
```

### 12.2 Analytics Review Cadence

- **Weekly:** AI Mentor sends brief summary (3 bullet points)
- **Monthly:** Full performance report with behavioral analysis
- **Per Term completion:** Comprehensive review before certificate issuance

---

*Document Version 1.0 — Phase 14*
