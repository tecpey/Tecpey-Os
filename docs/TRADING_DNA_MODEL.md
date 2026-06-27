# TecPey Academy — Trading DNA Model

**Phase 14 Strategic Document**
**Version:** 1.0
**Date:** 2026-06-27
**Status:** Implementation-Ready

---

## Overview

Trading DNA is TecPey Academy's proprietary framework for measuring the behavioral and psychological competence of a trader — beyond profit and loss.

The core insight: **profitability is a lagging indicator of trading competence. Behavioral consistency is a leading indicator.**

A student with high Trading DNA is a student who has internalized the disciplines required for long-term survival in the market. A student with high P&L but low Trading DNA is a lucky beginner on a temporary streak.

Trading DNA is the honest score.

---

## Part 1 — Philosophy

### 1.1 Why P&L is Insufficient

Profit and loss in a simulator (or even in early live trading) is dominated by:
- Short-term luck and variance
- Market conditions that reward certain approaches temporarily
- Risk-taking that happens to pay off but isn't sustainable

A student who made 40% profit by violating every rule and taking massive positions is not a successful student. A student who made 5% profit with perfect risk management and zero rule violations is more advanced.

Trading DNA measures what matters: the behaviors and disciplines that produce sustainable outcomes.

### 1.2 The Model

Trading DNA is a composite score (0–100) across 12 behavioral dimensions. Each dimension is measured from simulator data, journal data, and behavioral signals detected by the AI Mentor.

---

## Part 2 — The 12 Dimensions

### Dimension 1: Risk Discipline (ریسک و انضباط)

**What it measures:** How consistently the student manages position size within their defined risk parameters.

**Data sources:**
- Position size as % of account (compared to student's rulebook)
- Stop-loss placement frequency
- Number of positions without stop-loss

**Scoring:**
| Behavior | Score Impact |
|----------|-------------|
| All positions sized within rule | +5 per trade |
| Position 10–20% over rule | -3 per trade |
| Position 20%+ over rule | -8 per trade |
| Trade opened without stop-loss | -10 per trade |

**Score interpretation:**
- 90–100: Exceptional risk discipline — consistent adherence
- 70–89: Good discipline with occasional lapses
- 50–69: Inconsistent — rule violations happen multiple times per week
- Below 50: High risk — student not ready for live market participation

---

### Dimension 2: Discipline (انضباط کلی)

**What it measures:** Adherence to the full trading rulebook across all simulator activity.

**Data sources:**
- Rule violation logs (per trade)
- Journal self-reported rule compliance
- Pattern violations detected by AI

**Scoring:**
Calculated as: (Rule-compliant trades / Total trades) × 100, weighted by severity of violations.

**Score interpretation:**
- 90%+ compliance: High discipline
- 75–89%: Developing discipline
- Below 75%: Systemic rule-breaking — requires behavioral coaching before advancement

---

### Dimension 3: Consistency (ثبات)

**What it measures:** Variance in trading behavior over time. Consistent traders apply the same process regardless of recent outcomes.

**Data sources:**
- Position size variance (standard deviation)
- Session frequency consistency
- Trade setup type frequency distribution
- Win/loss streaks vs behavioral changes

**Formula:**
```
Consistency Score = 100 - (Behavioral Variance Index × 100)

Behavioral Variance Index = 
  Weighted average of:
  - Position size standard deviation (normalized)
  - Setup type distribution shift after wins vs after losses
  - Session frequency coefficient of variation
```

**Key signal:** If a student trades differently after wins than after losses, that's a consistency problem (emotion affecting process).

---

### Dimension 4: Patience (صبر)

**What it measures:** The student's ability to wait for high-quality setups and not overtrade.

**Data sources:**
- Average holding time per trade
- Number of trades per session vs stated strategy (from rulebook)
- Number of trades on no-setup days
- Time between signals and entries (impulsive vs deliberate)

**Scoring:**
- Low trade frequency + high setup quality: High patience
- High trade frequency + low average R:R: Low patience
- Trading on "boredom" days: Penalized

**Patience Score ≥ 70 requirement:** Required before Term 6 (Strategy & System) certificate is awarded.

---

### Dimension 5: FOMO Resistance (مقاومت در برابر FOMO)

**What it measures:** How often the student chases price movements they missed.

**FOMO Trade Detection:**
A trade is flagged as potential FOMO when:
- Asset moved 8%+ in the previous 4 hours
- Entry is within 30 minutes of the move completion
- Journal pre-trade rationale includes no technical analysis basis
- OR: Journal emotional state logged as "Excited" or "Anxious"

**Scoring:**
- 0 FOMO trades: Maximum score
- 1–2 FOMO trades per 50 trades: Moderate deduction
- 3+ FOMO trades per 50 trades: Significant deduction + AI intervention

**FOMO Index** is displayed prominently in the student's behavioral dashboard because it is one of the most destructive patterns in beginner traders.

---

### Dimension 6: Revenge Trading Resistance (مقاومت در برابر معامله انتقامی)

**What it measures:** Whether the student increases risk or changes behavior after a loss.

**Revenge Trade Detection:**
A trade is flagged as potential revenge trade when:
- Trade opened within 15 minutes of a losing trade closing
- Position size 30%+ larger than the previous trade
- OR: Pattern of increasing size after consecutive losses

**Scoring:**
- 0 revenge trades: Maximum score
- 1 revenge trade per 50 trades: Moderate deduction
- 2+ revenge trades per 50 trades: Significant deduction + mandatory module 5.3 review

**Revenge Trading Score ≥ 70 requirement:** Required before any Advanced Track certificate.

---

### Dimension 7: Position Sizing (اندازه موقعیت)

**What it measures:** Accuracy and appropriateness of position sizing relative to defined risk parameters.

**Data sources:**
- % account per trade
- R-value per trade (risk in R multiples)
- Adherence to Kelly fraction (if used)

**Scoring:**
- Positions sized to defined rule consistently: High score
- Occasionally oversizing: Moderate deduction
- Systematic oversizing: Low score

Position sizing is scored separately from Discipline because it captures the quantitative precision of risk management, not just rule-following intent.

---

### Dimension 8: Rule Following (پیروی از قانون)

**What it measures:** The ratio of trades that comply with every rule in the student's personal rulebook.

This dimension is similar to Dimension 2 (Discipline) but focuses specifically on the Personal Rulebook as defined in Term 5, rather than general trading principles. The distinction:
- Discipline = general best practice adherence
- Rule Following = adherence to the student's own explicitly stated rules

A student who violates their own rules is demonstrating self-deception — a dangerous pattern.

**Scoring:**
- 100% rule compliance: Maximum score
- Each violation: -5 points

**Rule Following Score is a hard gate:** Below 60%, the student cannot advance to Term 6.

---

### Dimension 9: Journal Quality (کیفیت ژورنال)

**What it measures:** The depth, consistency, and honesty of the student's trade journal.

**Scoring factors:**
| Factor | Weight |
|--------|--------|
| Journal completion rate (% of trades with journal) | 40% |
| Minimum word count met (pre and post) | 20% |
| Self-identified rule violations (honesty indicator) | 20% |
| Post-trade reflection depth (assessed by AI) | 20% |

**Journal Quality Score ≥ 65% requirement:** Required for Term 5 certificate.

**Why self-identified violations matter:** A student who identifies their own rule violations in the journal demonstrates metacognition and intellectual honesty — far more valuable than a clean journal that never admits mistakes.

---

### Dimension 10: Study Quality (کیفیت مطالعه)

**What it measures:** The quality of the student's learning engagement.

**Scoring factors:**
| Factor | Weight |
|--------|--------|
| Knowledge check accuracy (weighted by concept importance) | 35% |
| Flashcard review consistency | 20% |
| Lesson completion (not just starting) | 20% |
| Time per lesson (within reasonable range) | 15% |
| Note-taking activity | 10% |

**Rushing signal:** If average lesson time is below 50% of the estimated reading time, Study Quality score is penalized. Speed-through behavior is tracked as a negative signal.

---

### Dimension 11: Simulator Quality (کیفیت شبیه‌ساز)

**What it measures:** The quality of simulator usage as an educational tool.

**Scoring factors:**
| Factor | Weight |
|--------|--------|
| Journal completion per trade | 30% |
| Setup variety (using multiple setups, not over-fitting) | 20% |
| Adherence to curriculum exercises | 20% |
| AI Mentor review requests per session | 15% |
| Replay mode usage | 15% |

This dimension captures whether the student is using the simulator to learn or just to "trade" without reflection.

---

### Dimension 12: Learning Consistency (ثبات یادگیری)

**What it measures:** The consistency of study habit over time.

**Scoring factors:**
| Factor | Weight |
|--------|--------|
| Days active per week (5+ days = full score) | 40% |
| Absence gap (days without any activity) | 30% |
| Session length consistency | 20% |
| Streak length as % of total enrollment days | 10% |

**Gap penalty:** Each consecutive day of absence above 3 days deducts 2 points from the base score (capped at -30).

---

## Part 3 — Composite Trading DNA Score

### 3.1 Formula

```
Trading DNA Score = Weighted average of 12 dimensions:

Risk Discipline        × 0.12
Discipline             × 0.10
Consistency            × 0.09
Patience               × 0.09
FOMO Resistance        × 0.10
Revenge Trade Resist.  × 0.10
Position Sizing        × 0.08
Rule Following         × 0.09
Journal Quality        × 0.07
Study Quality          × 0.07
Simulator Quality      × 0.05
Learning Consistency   × 0.04
                        ────
Total                  = 1.00
```

### 3.2 Score Interpretation

| Score | Level | Meaning |
|-------|-------|---------|
| 90–100 | Professional | Exceptional behavioral discipline. Ready for advanced challenges. |
| 75–89 | Advanced | Strong foundations. Minor behavioral gaps. Approaching professional standard. |
| 60–74 | Developing | Solid progress. Identified patterns requiring work. Not ready for Advanced Tracks. |
| 45–59 | Beginner | Core disciplines not yet internalized. Focus on foundational habits. |
| Below 45 | Critical | Significant behavioral risk patterns. Active AI Mentor intervention required. |

### 3.3 Score Update Frequency

- Updated after every simulator session (for trading dimensions)
- Updated after every study session (for learning dimensions)
- Minimum 30 trades required before trading dimensions are scored (insufficient data before that)

---

## Part 4 — Reward Score

### 4.1 What Reward Score Measures

Reward Score is a combined metric of academic performance and behavioral excellence:

```
Reward Score = 
  (Academic Score × 0.50) + (Trading DNA × 0.50)

Academic Score = 
  Weighted average of all quiz/exam scores
```

### 4.2 Reward Score Uses

- Determines eligibility for scholarships and monthly awards
- Required for Prop Qualification challenge (see Reward System document)
- Displayed on public student profile (opt-in)
- Used in leaderboard rankings (discipline-weighted, not P&L)

---

## Part 5 — Certification Score

### 5.1 Certification Eligibility

Each term's certificate requires:

| Requirement | Minimum |
|-------------|---------|
| All module quizzes passed | 75% |
| Final exam passed | 70% |
| Simulator exercises completed | 100% |
| Trading DNA Score | ≥ 55 (Terms 1–3), ≥ 65 (Terms 4–5), ≥ 70 (Terms 6–7) |
| Journal Quality Score | ≥ 60% (Terms 4–7) |
| Learning Consistency | ≥ 60% |

### 5.2 Certificate Score Displayed

Each certificate displays:
- Academic Score (exam performance)
- Trading DNA Score (at time of certification)
- Total Certification Score (weighted composite)

This transparency means that a certificate score of 85/100 is meaningfully different from 65/100 — and employers, prop firms, or community members can interpret the score accurately.

---

## Part 6 — Trading DNA Reports

### 6.1 Per-Dimension Breakdown

Students see their Trading DNA breakdown as a radar chart with 12 dimensions. This visual makes it immediately clear which dimensions are strong and which need work.

### 6.2 Historical Trend

Each dimension shows a 90-day trend line. Improvement is celebrated; regression triggers AI Mentor review.

### 6.3 Peer Comparison (Opt-In)

Students can opt-in to see their Trading DNA percentile compared to all Academy students at the same term level. This provides external benchmarking without revealing individual data.

---

*Document Version 1.0 — Phase 14*
