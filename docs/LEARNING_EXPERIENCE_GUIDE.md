# TecPey Academy — Learning Experience Guide

**Phase 14 Strategic Document**
**Version:** 1.0
**Date:** 2026-06-27
**Status:** Implementation-Ready

---

## Purpose

This document defines every component of the student learning experience in TecPey Academy. It specifies what students see, how they interact, what they feel, and what mechanics drive engagement, retention, and real learning.

Every UI/UX decision in the Academy must be traceable to a principle in this document.

---

## Part 1 — Lesson Page Design

### 1.1 Anatomy of a Lesson Page

```
┌─────────────────────────────────────────────────────┐
│  [Back to Term]     Term 3 › Module 2 › Lesson 4    │
│  ─────────────────────────────────────────────────── │
│  Progress: ████████░░░░  65%  (12 of 18 lessons)     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  [Lesson Title — Clear, descriptive, no jargon]     │
│                                                      │
│  Reading time: ~8 min   [Bookmark]  [Note]          │
│                                                      │
├─────────────────────────────────────────────────────┤
│  CONTENT AREA                                        │
│  - Introduction paragraph (objective + hook)         │
│  - Section 1 with inline example                     │
│  - [Interactive element or chart if applicable]      │
│  - Section 2 with concrete scenario                  │
│  - [Glossary term links throughout]                   │
│  - Summary (key points, 3 bullets max)               │
│  - Responsible Trading Note (where applicable)       │
│                                                      │
├─────────────────────────────────────────────────────┤
│  [ ← Previous Lesson ]   [ Continue to Exercise → ] │
└─────────────────────────────────────────────────────┘
```

### 1.2 Lesson Page Rules

- **No lesson is longer than 1500 words** (text portion). Longer content is split into multiple lessons.
- **Hero image or illustration** at top of every lesson — relevant, culturally appropriate, original
- **Reading time estimate** is displayed. Target: 5–12 minutes per lesson.
- **All subheadings** use H2 or H3. No deeper nesting.
- **First use** of any technical term → clickable link to Glossary tooltip
- **No external links** within lesson content (prevents flow interruption)
- **Lesson objective** stated in the first paragraph: "در این درس یاد می‌گیری که..."
- **Lesson summary** is always the last element before the Continue button

### 1.3 Content Types Supported

| Type | Use Case | Mobile-First |
|------|----------|-------------|
| Text + Images | Primary content delivery | ✓ |
| Video (embedded) | Concept visualizations | ✓ (optional to complete lesson) |
| Interactive Diagram | Process flows, chart reading | ✓ |
| Scenario Card | Real-world application | ✓ |
| Comparison Table | Asset types, strategy comparison | ✓ |
| Timeline | Historical events, market cycles | ✓ |
| Calculator | Position sizing, R/R calculation | ✓ |

---

## Part 2 — Video

### 2.1 Video Standards

- **Maximum length:** 8 minutes per video
- **Captioned:** Always. Persian captions are mandatory. English captions for /en path.
- **Format:** Talking head + screen recording hybrid, or animation. No slideshow-only.
- **Tone:** Conversational, direct. No corporate stiffness.
- **Production quality:** Minimum 1080p, professional audio (no room noise)

### 2.2 Video Player Features

- Speed control (0.75x, 1x, 1.25x, 1.5x, 2x)
- Caption toggle
- Chapter markers for videos over 3 minutes
- Resume from last position
- Offline cache (for mobile)

### 2.3 Video-Optional Design

Video is supplementary, not required. Every video lesson is accompanied by a complete text version. Students who cannot watch video (bandwidth, hearing impaired) lose no learning value.

---

## Part 3 — Reading (Text Lessons)

### 3.1 Typography Standards

- **Body font:** IRANYekanX (fa-IR), Inter (en-US)
- **Body size:** 17px on mobile, 18px on desktop
- **Line height:** 1.8 (Persian), 1.7 (English)
- **Line length:** Maximum 65 characters (en), 55 characters (fa — wider characters)
- **Paragraph max:** 4 sentences

### 3.2 Text Interaction

- Tap-to-define: Any highlighted term can be tapped for a glossary tooltip
- Text highlighting (student can highlight passages, saved to their notes)
- Text-to-speech (accessibility) — uses device TTS API

---

## Part 4 — Interactive Examples

### 4.1 Types

**Scenario Explorer**
Student is presented with a market scenario. Choices branch to different outcomes with explanations.
> Example: "Bitcoin drops 15% overnight. You have an open position at 2x leverage. Choose what to do: (A) Hold (B) Add to position (C) Close partial (D) Close all"
> Each choice leads to an outcome screen with explanation.

**Chart Practice**
An interactive TradingView-style chart is presented. Student must identify a specific pattern, mark a level, or answer a question about the chart.

**Calculator Exercise**
An embedded calculator where student inputs their own numbers to see position size, risk, or R/R output. The exercise requires them to match a target risk profile.

**Matching Exercise**
Drag-and-drop matching of terms to definitions or concepts to examples.

**Timeline Builder**
Student arranges events in order (market cycle phases, analysis steps, etc.).

### 4.2 Interactive Element Rules

- Every interactive element must be completable without reading instructions (self-evident UI)
- Completion of an interactive element is tracked as engagement signal
- Failed interactive attempts do not block lesson completion — only quiz fails do
- Interactive elements are not optional for simulator-type exercises

---

## Part 5 — Knowledge Checks (In-Lesson Quizzes)

### 5.1 Design

Knowledge checks appear after every 2–3 content sections within a lesson. They are low-stakes, in-context, and immediate.

Format:
```
────────────────────────────────────────────────
بررسی یادگیری

[Question based on the last 2 sections]

○  Answer A
○  Answer B
○  Answer C
○  Answer D

[ بررسی پاسخ ]
────────────────────────────────────────────────
```

After answering:
- Correct: Green confirmation + brief reinforcement statement
- Incorrect: Red indicator + explanation of the correct answer + link to review the relevant section

### 5.2 Rules

- Maximum 2 questions per knowledge check (not to interrupt flow)
- Questions test application, not recall of specific sentences
- No timer on knowledge checks (no stress)
- Incorrect answers do not prevent lesson continuation
- Knowledge check results are tracked for spaced repetition scheduling

---

## Part 6 — Flashcards

### 6.1 Flashcard System

Each Academy lesson generates automatic flashcards for all key terms introduced. Students can also create manual flashcards while reading.

**Flashcard Front (question side):**
Term name in Persian

**Flashcard Back (answer side):**
- Definition (2 sentences max)
- Example (1 concrete sentence)
- Related terms (linked)

### 6.2 Flashcard Deck Management

- Auto-generated deck: per lesson, per module, per term
- Personal deck: student-created cards
- Combined review deck: all cards due today (spaced repetition)

### 6.3 Flashcard Interface

- Tap card to flip
- Swipe right = "I knew this" (schedules at longer interval)
- Swipe left = "I didn't know" (schedules at short interval — next day)
- Rating option: Easy / Medium / Hard (adjusts SM-2 interval)
- Streak counter for flashcard sessions

---

## Part 7 — Spaced Repetition

### 7.1 Algorithm

TecPey Academy uses a variant of the SM-2 algorithm (SuperMemo 2) for scheduling flashcard reviews.

**Interval schedule on "I knew this":**
- First review: Day 1
- Second review: Day 3
- Third review: Day 7
- Fourth review: Day 14
- Fifth review: Day 28
- Subsequent: multiply by 2.5 each time

**On "I didn't know":**
- Resets to Day 1

### 7.2 Daily Review Queue

The "Today's Review" section shows all flashcards due. It is capped at 30 cards per session to prevent overwhelm. Overflow cards are carried to the next day without penalty.

### 7.3 Spaced Repetition for Concepts (Not Just Flashcards)

Beyond flashcards, the curriculum itself applies spaced repetition:
- Concepts from earlier terms are referenced in later terms
- Practice questions include items from previous modules (interleaving)
- AI Mentor periodically tests recall of earlier concepts in coaching sessions

---

## Part 8 — Revision Mode

### 8.1 What is Revision Mode?

Before any assessment (module quiz, midterm, final exam), students can enter Revision Mode. This is a focused review session that:

1. Shows their weakest areas based on knowledge check history
2. Presents flashcards for low-performing concepts
3. Offers a practice quiz drawn from the full question bank
4. Gives the AI Mentor a summary to discuss

### 8.2 Revision Mode Interface

```
┌─────────────────────────────────────────────────────┐
│  📚 Revision Mode — Module 3 Quiz Preparation        │
│                                                      │
│  Your Weak Areas (based on your knowledge checks):  │
│  ● Support & Resistance (63% accuracy)              │
│  ● RSI interpretation (58% accuracy)                │
│                                                      │
│  Recommended:                                        │
│  1. Review Lesson 3.2 Support & Resistance (8 min)  │
│  2. Flashcard review — Technical Indicators (15 fc) │
│  3. Practice Quiz (10 questions)                     │
│                                                      │
│  [ Start Revision Session ]                          │
└─────────────────────────────────────────────────────┘
```

---

## Part 9 — Bookmarks

### 9.1 Bookmarking

Students can bookmark any lesson, section within a lesson, or specific paragraph. Bookmarks are:
- Accessible from the student dashboard
- Categorized by term and module
- Searchable
- Exportable as a reading list

### 9.2 Bookmark Types

- 📌 Reference: "I will need this later"
- ❓ Question: "I don't understand this yet"
- ⭐ Favorite: "This is important to me"

Each type surfaces differently in the dashboard. Question-type bookmarks trigger an AI Mentor prompt on the next login.

---

## Part 10 — Notes

### 10.1 Note-Taking System

Students can add notes anywhere in the lesson content. Notes are:
- Attached to the specific paragraph or section
- Displayed in the margin as a tab indicator
- Searchable across all notes
- Exportable as plain text or PDF

### 10.2 AI-Assisted Notes

Students can ask the AI Mentor to expand on a note:
- "What I wrote: RSI above 70 = overbought"
- AI Mentor: "That's a useful shorthand. Do you want to understand why RSI uses 70/30 as thresholds rather than other numbers?"

---

## Part 11 — Glossary

### 11.1 Glossary Standards

- **Coverage:** Every technical term used anywhere in the Academy is in the Glossary
- **Minimum per entry:** Term, definition (≤100 words), 1 concrete example, related terms
- **Language:** Persian-primary. English equivalent listed.
- **Searchable:** Full-text search within glossary
- **Linkable:** Every term has a permanent URL (e.g., `/academy/glossary/rsi`)

### 11.2 Glossary Access

- From within any lesson (tap highlighted term)
- From the dedicated Glossary page
- From the AI Mentor (glossary terms linked in responses)
- From the student dashboard

### 11.3 Glossary Governance

- New terms added only by approved reviewers
- Definitions reviewed for accuracy annually or when market terminology evolves
- Persian translation reviewed by native speaker with financial background

---

## Part 12 — Search

### 12.1 Academy Search

Full-text search across:
- All lesson content
- Glossary
- Module titles and descriptions
- FAQ content

**Search Result Format:**
- Lesson title → term/module breadcrumb
- Excerpt showing search term in context
- Direct link to the relevant section

### 12.2 Search UX

- Instant results (as-you-type, debounced 300ms)
- Results grouped by type (Lessons, Glossary, Modules)
- Persian search with stemming (درس vs درس‌ها treated identically)
- "Did you mean?" for common misspellings

---

## Part 13 — Offline Support

### 13.1 What is Available Offline

| Feature | Offline Available |
|---------|------------------|
| Downloaded lessons (text + images) | ✓ |
| Flashcard review | ✓ |
| Notes | ✓ (sync when online) |
| Knowledge checks | ✓ (submit when online) |
| Videos | ✓ (if pre-downloaded) |
| Module quizzes | ✗ (requires online connection) |
| Trading Arena simulator | ✗ |
| AI Mentor | ✗ |

### 13.2 Download Management

- Students can download individual lessons or full modules for offline use
- Download progress shown (lesson text: ~100KB, lesson with images: ~500KB)
- Downloaded content respects curriculum version — outdated downloads flagged

### 13.3 Sync Behavior

- Study time logged offline is synced on reconnect
- Knowledge check answers submitted offline are queued and submitted on reconnect
- Conflict resolution: server state wins on sync conflicts

---

## Part 14 — Progress Tracking

### 14.1 Progress Dimensions

Students see their progress along multiple dimensions:

**Completion Progress:** % of lessons, modules, and terms completed
**Mastery Progress:** Average score across all knowledge checks and quizzes
**Consistency Score:** Based on study streak and session frequency
**Simulator Progress:** Number of trades, behavioral score, rule compliance
**Trading DNA Score:** See Trading DNA Model document

### 14.2 Dashboard Layout

```
┌──────────────┬──────────────┬──────────────┐
│  Term 3/7    │  Mastery 72% │  Streak 🔥 8 │
│  Progress    │  Score       │  Days        │
├──────────────┴──────────────┴──────────────┤
│  Today's Plan:                              │
│  ├─ Review 5 flashcards due               │
│  ├─ Complete Lesson 3.4 (8 min)           │
│  └─ Simulator: 1 practice trade           │
├─────────────────────────────────────────────┤
│  Continue where you left off:              │
│  ▶ Lesson 3.4 — Volume Indicators          │
└─────────────────────────────────────────────┘
```

### 14.3 Progress Visualization

- Per-module progress ring
- Term completion timeline
- Mastery heatmap (shows weak areas visually)
- Study calendar (daily activity view)

---

## Part 15 — Achievements

### 15.1 Achievement System

Achievements are awarded for meaningful milestones, not arbitrary actions.

**Tier 1 — Milestones**
- First Lesson Completed
- First Module Completed
- First Quiz Passed (80%+)
- First Simulator Trade
- First Term Certificate

**Tier 2 — Consistency**
- 7-Day Streak
- 30-Day Streak
- 100-Day Streak
- 30 Days Without Missing Flashcard Review

**Tier 3 — Mastery**
- Perfect Score on Module Quiz
- Mastery Score 90%+ across a full term
- Full Glossary coverage (all terms reviewed)

**Tier 4 — Behavioral**
- Zero Rule Violations in 50 Simulator Trades
- 5 Consecutive Winning Simulator Weeks
- Complete Emotional Log for 30 Days

**Tier 5 — Community**
- First Mentor Session
- Helped 5 Students in Community
- Published a trade analysis reviewed positively

### 15.2 Achievement Display

Achievements are displayed on the public student profile (if student makes profile public). Certificates and Tier 3+ achievements are listed on the verified certificate verification page.

---

## Part 16 — Learning Streak

### 16.1 Streak Definition

A streak day is counted when a student completes at least one of:
- 1 lesson
- 1 flashcard review session (minimum 5 cards)
- 1 simulator trade
- 1 AI Mentor session (minimum 5 exchanges)

**Why multiple options:** Different days have different availability. The streak must reward consistent engagement, not rigid routine.

### 16.2 Streak Protection

- **Streak Freeze:** Available 2 times per calendar month. Can be spent to protect streak when student misses a day. Must be used proactively (before midnight of the missed day).
- **Streak Recovery:** If a student misses without a freeze, streak resets but is preserved as "longest streak" in profile.

### 16.3 Streak Milestones

7, 14, 30, 60, 100, 200, 365 days — each triggers a special achievement and XP bonus.

---

## Part 17 — Motivation Architecture

### 17.1 Principles

TecPey Academy uses motivation architecture grounded in Self-Determination Theory (SDT):

**Autonomy** — Students choose their pace, format preferences, and depth of exploration. The curriculum provides structure; the learner drives it.

**Competence** — Progressive mastery design ensures students feel capable at each stage. Difficulty scales with demonstrated ability.

**Relatedness** — Community features, AI Mentor relationship, and leaderboard create a sense of belonging to the TecPey Academy cohort.

### 17.2 Motivation Mechanics

| Mechanic | Purpose | Psychological Driver |
|----------|---------|---------------------|
| Daily streak | Habit formation | Commitment & consistency |
| XP system | Progress visibility | Operant conditioning (variable reward) |
| Leaderboard | Social comparison | Social motivation |
| Certificates | Identity affirmation | Self-concept as "learner" |
| AI Mentor coaching | Personal relationship | Relatedness |
| Mastery gates | Sense of earning | Competence |

### 17.3 Anti-Motivation Patterns to Avoid

- Streak anxiety: Never shame streak breaks. Frame return as easy.
- Grade anxiety: Low-stakes in-lesson checks. Assessment anxiety reserved for formal exams only.
- Gamification overload: Achievements must be earned by real learning behaviors, not clicking.
- Progress comparison anxiety: Leaderboard is opt-in, not default.

---

*Document Version 1.0 — Phase 14*
