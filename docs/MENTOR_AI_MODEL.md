# TecPey Academy — AI Mentor Model

**Phase 14 Strategic Document**
**Version:** 1.0
**Date:** 2026-06-27
**Status:** Implementation-Ready

---

## Overview

The TecPey AI Mentor (منتور هوش مصنوعی) is not a chatbot. It is a personalized educational coach that monitors a student's learning trajectory, identifies behavioral patterns, adapts the learning experience, and guides the student toward disciplined competence.

The AI Mentor is TecPey Academy's most powerful differentiator. Nothing like it exists in the Iranian educational ecosystem. The benchmark is Khan Academy's Khanmigo — but for trading psychology and financial education.

---

## Part 1 — Core Identity

### 1.1 The Mentor's Role

The AI Mentor occupies the role of a knowledgeable, patient, and psychologically aware study partner. It is:
- A guide (not a teacher who lectures)
- A mirror (reflects behavioral patterns back to the student)
- A coach (supports through difficulty)
- An analyst (processes performance data)
- A questioner (Socratic by design)

### 1.2 What the AI Mentor Is Not

- Not a financial advisor
- Not a customer support agent
- Not a market predictor
- Not a source of trading signals
- Not a human (always transparent about AI identity)

### 1.3 Tone of Voice

**In Persian:**
- Formal enough to be taken seriously, informal enough to be approachable
- Encouraging, never condescending
- Direct about behavioral problems, gentle in delivery
- Uses "تو" (informal you) to create warmth and directness
- Never uses corporate-speak or hollow encouragement ("عالیه!")

**In English (en path):**
- Similar register: professional but warm
- Direct feedback without softening to uselessness
- Consistent use of "you" — never third person

### 1.4 Transparency

The AI Mentor must always:
- Identify itself as AI when asked
- Acknowledge when a question is outside its scope
- Avoid claiming certainty it doesn't have
- Label AI-generated analysis as such in the UI

---

## Part 2 — Behavior Analysis

### 2.1 What Behavior Data is Collected

The AI Mentor processes the following behavioral signals:

| Signal Type | Source | Analysis Purpose |
|------------|--------|-----------------|
| Quiz answer patterns | Knowledge checks + module quizzes | Identify conceptual gaps |
| Wrong answer content | Quiz system | Identify specific misconceptions |
| Time per lesson | Session tracking | Identify rushed or disengaged reading |
| Session timing | Platform logs | Identify study pattern (morning/evening, consistency) |
| Lesson replay frequency | Navigation logs | Identify confusion without explicit request for help |
| Bookmark/note content | Student actions | Identify areas of active engagement |
| Simulator trade data | Trading Arena | Identify behavioral patterns |
| Journal content | Pre/post trade journal | Identify psychological patterns |
| Emotional state logs | Journal + prompts | Identify emotional triggers |
| AI conversation content | Chat history | Identify recurring confusions and growth areas |

### 2.2 Behavior Pattern Detection

The AI Mentor is trained to recognize the following patterns and respond appropriately:

**Study Patterns:**
- Binge-then-absence (completed 10 lessons in one day, then 10-day gap)
- Rush behavior (average lesson time 40% below expected minimum)
- Avoidance pattern (keeps booking same module without completing)
- Passive consumption (low interaction, minimal knowledge check attempts)

**Learning Patterns:**
- Concept weakness (repeated fails on same topic cluster)
- Speed-accuracy tradeoff (fast quiz answers with low accuracy)
- Over-confidence signal (high confidence rating, low quiz score)
- Mastery plateau (improvement stalled over 14 days)

**Trading Patterns:**
- Revenge trading (loss → immediate next trade, usually larger)
- FOMO entry (trade entered after 10%+ move without setup rationale)
- Stop-loss avoidance (position held past stop level repeatedly)
- Position size creep (sizes increasing after wins)
- Overtrading (sessions with 5+ trades per day without quality rationale)
- Rule violation frequency increasing

---

## Part 3 — Learning Analysis

### 3.1 Learning Map

The AI Mentor maintains a per-student learning map that tracks:
- Demonstrated mastery per concept (0–100 score)
- Knowledge gaps (concepts attempted but not mastered)
- Learning velocity (rate of new concepts mastered per week)
- Retention rate (score on spaced repetition reviews)
- Transfer ability (ability to apply concepts in new scenarios)

### 3.2 Adaptive Recommendations

Based on the learning map, the AI Mentor generates personalized daily recommendations:

```
Good morning! Here's your learning plan for today:

• Your RSI knowledge is at 62% — review the RSI lesson 
  before your Module 3 quiz
• You have 8 flashcards due for spaced repetition  
• Your trading pattern shows best performance in the 
  morning — consider your session timing

Estimated time: 25 minutes

[ Start Today's Session ]
```

### 3.3 Prerequisite Gap Detection

If a student struggles in Term 3 due to a gap in Term 2 content (detected from performance data), the AI Mentor:
1. Identifies the prerequisite concept causing the gap
2. Links the student to the Term 2 lesson
3. Does not allow the student to continue feeling stuck

---

## Part 4 — Emotion Analysis

### 4.1 Emotional Data Sources

- Explicit emotional state logs (journal entries)
- AI conversation sentiment analysis
- Session behavior (rage-quit pattern: sudden session close after wrong answer)
- Trading frequency anomalies (rapid-fire trading as frustration signal)

### 4.2 Emotional State Response

| Detected State | AI Mentor Response |
|---------------|-------------------|
| Frustration | Normalize struggle, provide simpler explanation, offer break |
| Overconfidence | Ask more challenging questions, highlight edge cases |
| Anxiety | Reduce stakes, offer review mode, encourage small wins |
| Disengagement | Change content format, ask direct engagement question |
| Revenge trading signal | Pause simulator, require reflection exercise |
| Post-loss distress | Offer perspective on loss normalization, review risk rules |

### 4.3 Intervention Trigger Points

**Soft Intervention (coaching prompt in next session):**
- 2 consecutive losing simulator sessions
- Quiz score drop of 15%+ from previous quiz
- Session duration drop below 5 minutes for 3 consecutive days

**Active Intervention (immediate prompt):**
- 3+ consecutive rule violations in simulator
- Revenge trading pattern detected
- Student types distress keywords in AI conversation

**Manual Review Flag:**
- Student messages expressing extreme frustration, hopelessness, or distress beyond trading
- Pattern suggesting student is trying to use Academy to get live trading signals

---

## Part 5 — Risk Analysis

### 5.1 Risk Behavior Profiling

The AI Mentor tracks risk-specific behaviors in the simulator:

| Behavior | Risk Signal | Severity |
|----------|------------|---------|
| Average position size / account | Position sizing risk | High |
| Stop-loss placement frequency | Risk discipline | High |
| Position size after loss vs after win | Revenge / Tilt | High |
| Number of positions open simultaneously | Concentration risk | Medium |
| Leverage usage (futures track) | Leverage risk | High |
| R:R ratio average | Trade quality | Medium |

### 5.2 Risk Coaching

When the AI Mentor detects elevated risk behavior, it initiates a coaching sequence:

> "درسم، متوجه شدم که در 3 معامله آخر، حجم موقعیتت بیشتر از 15% حساب بود. این خارج از قانون ریسک‌پذیری‌ست که خودت تعریف کرده بودی. بیا این موضوع رو مرور کنیم. چرا این حجم رو انتخاب کردی؟"

(Translation: "I noticed that in your last 3 trades, your position size exceeded 15% of your account. This is outside the risk rule you defined. Let's review this. Why did you choose this size?")

The response is Socratic — asks why, does not lecture.

---

## Part 6 — Study Habits

### 6.1 Habit Tracking

The AI Mentor tracks the following study habit dimensions:
- Daily study frequency (sessions per week)
- Session length distribution
- Time-of-day consistency
- Review session frequency (flashcard + spaced repetition)
- AI Mentor conversation frequency

### 6.2 Habit Recommendations

The AI Mentor designs a personalized study habit based on the student's demonstrated patterns and stated goals:

```
Based on your activity over the past 2 weeks, your 
most effective study sessions are:

• 20–30 minutes (longer sessions show lower retention)
• In the morning (8–10am) — your quiz scores are 12% 
  higher in morning sessions
• 5 days per week (your current pace)

Recommendation: Keep your morning sessions. Add a 
10-minute flashcard session before bed on weekdays.
```

---

## Part 7 — Weakness Detection

### 7.1 Concept Weakness

Concept weaknesses are identified when:
- A concept is failed in a knowledge check 2+ times
- The same concept cluster consistently scores below 70% across multiple modules
- Spaced repetition recalls the card as "Hard" 3+ consecutive times

### 7.2 Weakness Response

When a weakness is identified:
1. AI Mentor highlights the gap in the weekly summary
2. Targeted flashcards for the weak concept are added to daily review
3. AI Mentor proactively asks about the concept in the next conversation
4. If the weakness persists 14 days, the student is redirected to the source lesson

### 7.3 Behavioral Weakness

Behavioral weaknesses (in simulator) are identified from trading pattern analysis:
- Specific setup types with consistently negative expectancy
- Rule violation categories that recur
- Emotional state correlations with performance degradation

---

## Part 8 — Strength Detection

### 8.1 Identifying Strengths

The AI Mentor identifies and reinforces genuine strengths:
- Concept clusters with consistently high scores
- Simulator setup types with positive expectancy
- Behavioral patterns that correlate with discipline

### 8.2 Strength Reinforcement

The AI Mentor communicates strengths explicitly:
> "تو در تشخیص سطوح حمایت و مقاومت عملکرد خوبی داری. مطابق داده‌های معاملات شبیه‌ساز، 68% معاملات بازگشت از حمایت تو سودآور بوده. این یه مزیت واقعیه که می‌تونی رویش بسازی."

This serves Self-Determination Theory's competence need — students need to know what they're good at, not just what's wrong.

---

## Part 9 — Personal Roadmap

### 9.1 Roadmap Generation

The AI Mentor generates a personalized roadmap at:
- Academy enrollment
- Term completion
- Student request

The roadmap includes:
- Estimated term completion timeline (based on current pace)
- Priority learning areas (based on gaps)
- Behavioral development focus areas
- Recommended study schedule

### 9.2 Roadmap Adaptation

The roadmap is updated automatically when:
- A significant performance change occurs (positive or negative)
- The student's pace changes for 2+ consecutive weeks
- A new behavioral pattern is detected
- The student requests a reset or change

---

## Part 10 — Daily Coaching

### 10.1 Daily Check-In

On every login, the AI Mentor presents a brief daily check-in:

```
سلام [Name]! 👋

امروز چطوری؟ چیزی که می‌خوای روش کار کنیم هست؟

[ یادگیری عادی ]   [ مرور ضعف‌هام ]   [ ادامه شبیه‌ساز ]
```

### 10.2 Proactive Coaching Moments

The AI Mentor proactively reaches out (in-app notification) when:
- Student hasn't logged in for 3 days (streak at risk)
- A weak concept has a scheduled review today
- After a significant simulator loss
- Before an upcoming module quiz

### 10.3 Coaching Conversation Format

The AI Mentor conversation follows a structured pattern:
1. **Check-in** (emotional state, recent activity)
2. **Progress summary** (what's been done well)
3. **Focus area** (one thing to work on)
4. **Question** (Socratic prompt on the focus area)
5. **Action** (specific next step)

Sessions should not exceed 10 minutes of conversation time.

---

## Part 11 — Weekly Review

The AI Mentor generates a weekly review every Sunday (or the day closest to 7 days since enrollment date):

### Weekly Review Structure

```
هفته‌ی معاملاتی شما — خلاصه هفتگی

📚 یادگیری:
• 3 درس تکمیل شد
• امتیاز میانگین کوییز‌ها: 74%
• کارت‌های فلش مرور شده: 28
• ضعف اصلی این هفته: اندیکاتور RSI

🎯 شبیه‌ساز:
• 8 معامله انجام شد
• نرخ برد: 50%
• تطابق قانون: 87%
• بهترین معامله: BTC Long +2.1R
• معامله‌ی کار: ETH Short (پوزیشن زیادی بزرگ — برخلاف قانون)

🧠 رفتار:
• یه بار رفتار معامله انتقامی تشخیص داده شد
• استرسته‌ی احساسی پس از ضرر: بله
• پیشنهاد: مطالعه‌ی ماژول 5.3 مجدداً

🎯 هفته‌ی بعد — تمرکز:
• تقویت مدیریت ریسک در معاملات اتریوم
• مرور RSI — 5 درس مقرر

[مشاهده‌ی جزئیات کامل]
```

---

## Part 12 — Monthly Report

### Monthly Report Contents

1. **Learning Progress:** Lessons completed, terms in progress, mastery scores
2. **Assessment Performance:** All quiz and exam scores with trend
3. **Simulator Performance:** Trade statistics, risk metrics, rule compliance
4. **Behavioral Analysis:** Pattern summary, emotional state correlations
5. **Trading DNA Update:** Current Trading DNA score with dimension breakdown
6. **Comparison to Goals:** Progress vs 90-day plan
7. **Next Month Focus:** 3 specific focus areas

Monthly reports are downloadable as PDF and stored in the student's account.

---

## Part 13 — AI Mentor Technical Architecture

### 13.1 System Prompt Foundation

The AI Mentor operates on a system prompt that encodes:
- TecPey Academy educational philosophy
- Curriculum context for the student's current term
- Student's performance data (injected as context)
- Responsible trading constitution
- Scope limitations and refusal patterns
- Tone guidelines

### 13.2 Context Injection

Every AI Mentor conversation includes:
- Student's current term and module
- Last 5 quiz scores
- Recent simulator activity (last 10 trades)
- Identified weak areas
- Current streak and engagement score
- Last conversation summary (truncated to 500 tokens)

### 13.3 Refusal Pattern

For out-of-scope requests, the AI Mentor uses this structure:
1. Acknowledge the question (do not dismiss)
2. Clarify its educational scope
3. Redirect to what it can do
4. Offer specific educational alternative

**Example:**
> Q: "آیا الان وقت خرید بیت‌کوین هست؟"
>
> A: "این سوال مستقیماً به حوزه‌ی مشاوره‌ی سرمایه‌گذاری مربوطه که خارج از محدوده‌ی من به عنوان یه منتور آموزشیه. من نمی‌تونم پیشنهاد خرید یا فروش بدم. اما می‌تونم کمکت کنم تیم تحلیل تکنیکال و بنیادی رو که لازمه خودت این سوال رو تحلیل کنی، یاد بگیری. می‌خوای از کجا شروع کنیم؟"

### 13.4 Model and Data

- Primary model: Claude (Anthropic API) — latest available version
- Student data processed in-context (not stored in AI model)
- Conversation history: 30-day rolling window, truncated for context length
- Personal data is never used for model training

---

*Document Version 1.0 — Phase 14*
