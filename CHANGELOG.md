# Changelog

All notable changes to TecPey are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow semantic milestones (Phase-based).

---

## [v0.18] — 2026-06-28 — Community & Social Learning Layer

### Added — Core Library

- `src/lib/community-profile.ts`: Privacy-first community profile. Interface: `CommunityPrivacySettings` (all defaults private/false), `CommunityProfile` (displayName, anonymousId, avatarInitials, privacy, groupInterests). Functions: `loadCommunityProfile()`, `saveCommunityProfile()`, `createCommunityProfile()` (generates anonymous ID `T-XXXXXX`), `updatePrivacy()`, `addGroupInterest()`, `removeGroupInterest()`, `sanitizeDisplayName()` (strips PII patterns). Storage: `tecpey-community-profile`.

- `src/lib/community-challenges.ts`: 5 weekly challenges cycling via `getCurrentWeekNumber() % 5`. Types: `ChallengeDifficulty`, `ChallengeFocus`, `Challenge`, `ChallengeParticipation`, `ChallengeCompletionCriteria` (union of 4 types). Functions: `getCurrentChallenge()`, `getNextChallenge()`, `loadParticipation()`, `joinChallenge()`, `markChallengeComplete()`. Label tables: `DIFFICULTY_LABEL`, `FOCUS_LABEL`. Storage: `tecpey-challenge-participation`.

- `src/lib/community-leaderboard.ts`: Behavioral-only leaderboard (profit ranking forbidden). Type: `LeaderboardCategory` (6 categories), `LeaderboardEntry`, `MyLeaderboardScores`. Functions: `computeMyLeaderboardScores()` (reads arena + behavioral engine, never uses P&L), `getLeaderboard()` (blends real score with 12 deterministic LCG demo peers), `generateDemoPeers()` (stable per category, seeded by name). Exports: `CATEGORY_LABEL`, `CATEGORY_DESCRIPTION`, `COMMUNITY_SAFETY_RULES` (7 rules).

- `src/lib/community-groups.ts`: 5 static demo study groups. Interface: `StudyGroup` (name, level, focusTopic, memberCount, weeklyGoal, progressSummary, groupChallenge, disciplineScore, isDemo). Groups: bitcoin-basics, risk-masters, psychology, behavioral-discipline, advanced-analysis. Labels: `LEVEL_LABEL`.

### Added — Components

- `src/components/academy/community/CommunityHub.tsx`: Main community hub. Sub-components: `ProfileSetup` (name input + privacy explanation), `MyScoreWidget` (5 dimension mini-scores), `ActiveChallengeCard` (current week challenge + join button), `NavTile` (route cards for 5 sub-sections), `SafetyRules` (expandable 7-rule list). Default-private messaging throughout.

- `src/components/academy/community/LeaderboardView.tsx`: Anti-profit leaderboard. Sub-components: `ScoreBar` (gradient for self, muted for others), `LeaderboardRow` (rank, avatar, name, demo badge, score bar), `MyScoreBreakdown` (5 dimension breakdown with weights), `LeaderboardView` (6 category tabs, anti-profit disclaimer, skeleton when no profile, safety rules footer). Demo peers labeled `نمایشی`.

- `src/components/academy/community/ChallengeCenter.tsx`: Weekly challenge UI. Sub-components: `checkChallengeCompletion()` (reads arena state + journal rate), `ActiveChallengePanel` (rules, scoring, reward, responsible trading note, join/check/complete buttons), `ChallengeHistoryCard` (past challenge status), `ChallengeCenter` (progress bar, active challenge, next week preview, history).

- `src/components/academy/community/StudyGroups.tsx`: Study group interest system. Sub-components: `GroupCard` (name, level, members, discipline score, focus/goal/challenge fields, interest button), `PrivacyGate` (opt-in gate for studyGroupInterest), `StudyGroups` (privacy gate → interest management → group cards). No chat, no DMs.

- `src/components/academy/community/PeerJournals.tsx`: Opt-in journal sharing. Functions: `sanitizeForSharing()` (strips PII, truncates, adds mentor note), `buildMentorNote()` (behavioral flag → coaching message). Sub-components: `SharedEntryCard` (asset, setup, mistake tags, lesson, mentor note), `SharingToggle` (opt-in/out with aria role=switch), `PeerJournals` (toggle + sanitized entries + 3 demo entries). Default off.

- `src/components/academy/community/InstructorDashboard.tsx`: Consent-gated instructor view. Sub-components: `ConsentGate` (explicit list of shared/not-shared data), `MetricBlock`, `WeakTopicsList` (knowledge-graph nodes not yet completed), `RiskPatternBar`, `InstructorDashboard` (profile → consent → `ConsentedView`), `ConsentedView` (6-metric grid, weakest/strongest dims, risk pattern bars, weak topics).

### Added — Routes

- `src/app/academy/community/page.tsx` — Updated: adds `CommunityHub` below existing `CommunityCareerPanel`
- `src/app/academy/community/leaderboards/page.tsx` — `LeaderboardView`
- `src/app/academy/community/challenges/page.tsx` — `ChallengeCenter`
- `src/app/academy/community/groups/page.tsx` — `StudyGroups`
- `src/app/academy/community/journals/page.tsx` — `PeerJournals`
- `src/app/academy/community/instructor/page.tsx` — `InstructorDashboard`

### Added — Documentation

- `docs/COMMUNITY_LEARNING_LAYER.md`: Full spec — privacy model, leaderboard anti-profit formulas, challenge criteria, study group architecture, journal sanitization, instructor consent flow, Phase 19 migration path.
- `docs/REWARD_SYSTEM.md`: Phase 18 section — community challenge XP bonuses, anti-gaming rules.
- `docs/TRADING_DNA_MODEL.md`: Phase 18 section — community leaderboard integration, excluded signals (winRate, avgPnlPct, totalPnl).
- `docs/MENTOR_AI_MODEL.md`: Phase 18 section — Instructor Dashboard architecture, consent stages, shared vs. not-shared data table, privacy boundaries.

### QA

- `npx tsc --noEmit`: 0 errors
- `npm run lint`: 0 errors, 0 warnings
- `npm run build`: Pass — all 6 community routes build as dynamic server routes

---

## [v0.17] — 2026-06-27 — Trading Arena V2: Behavioral Trading Simulator

### Added — Core Library

- `src/lib/trading-arena.ts`: Complete paper-trading engine. Types: `OpenPosition`, `ClosedTrade`, `PendingOrder`, `TradingArenaState`, `MentorFlag`. Functions: `createFreshArenaState()`, `loadArenaState()`, `saveArenaState()`, `executeMarketBuy()` (with slippage ±0.05%), `closePosition()`, `addLimitOrder()`, `cancelLimitOrder()`, `processPriceTick()` (fills limit orders + checks SL/TP), `computeUnrealizedPnl()`, `computeNetEquity()`, `computeArenaStats()`, `resetArenaState()`. Mentor flag detection at trade open: `no-stop-loss`, `over-risk`, `impulse-entry`, `revenge-trade`, `good-discipline`, `proper-sizing`, `target-hit`, `fomo-entry`. Fee: 0.1% per side. Max positions: 5. Storage: `tecpey-trading-arena`.

- `src/lib/trading-scenarios.ts`: 6 production scenarios with deterministic LCG/custom price sequences. Each scenario includes: objective, marketContext, concept, allowedActions, initialBalance, priceSequence, successCriteria, failureCriteria, mentorFeedback (pass/fail headline + body + keyLesson), dnaImpact (6 behavioral dimensions). Scenarios: `beginner-btc` (interface basics), `volatility` (patience under swings), `fomo-scenario` (FOMO resistance — success = zero trades), `revenge-trading` (revenge control), `risk-management` (stop-loss discipline), `news-reaction` (event-driven decision quality).

- `src/lib/trading-journal.ts`: Trade journal storage. Types: `EmotionalState` (6 states), `MistakeTag` (10 tags), `JournalEntry`. Functions: `createJournalEntry()`, `loadJournal()`, `saveJournalEntry()`, `completeJournalEntry()`, `getJournalCompletionRate()`. Persian label tables: `EMOTIONAL_STATE_LABEL`, `MISTAKE_TAG_LABEL`. Storage: `tecpey-trading-journal`.

- `src/lib/trading-dna.ts`: Trading DNA behavioral signal extraction. `collectTradingDNASignals()` reads arena state + journal and produces: stopLossRate, overRiskRate, revengeTradeRate, impulseRate, journalCompletionRate, winRate, targetHitRate, scenariosCompleted, scenariosPassed, avgPnlPct. Scorer functions: `tradingRiskScore()`, `tradingPatienceScore()`, `tradingFOMOScore()`, `tradingRevengeScore()`, `tradingReflectionScore()`, `tradingDecisionScore()`. `blendWithTrading()` weights trading data 0%→40% as trades accumulate (0→10+ trades).

### Updated — Behavioral Engine

- `src/lib/behavioral-engine.ts`: Added `trading: TradingDNASignals` to `RawInputs`. `collectInputs()` now calls `collectTradingDNASignals()`. 7 dimension scorers now blend learning + trading signals: `scoreDisipline`, `scorePatience`, `scoreRiskManagement`, `scoreReflection`, `scoreFomoRisk`, `scoreRevengeRisk`, `scoreDecisionQuality`. Zero-safe: when no trading data exists, blend weight is 0% (full backward compatibility with Phase 16 behavior).

### Added — Components

- `src/components/academy/trading-arena/TradingArenaDashboard.tsx`: Main arena UI. Sub-components: `useSimulatedPrices` (±0.12%/2s random walk, BTC seed $65k, ETH seed $3.5k), `JournalModal` (pre-trade plan + emotional state modal), `TradeForm` (asset + order type + amount + SL/TP), `PositionRow` (live P&L, close button, SL warning), `TradeRow` (closed trade history), `MentorFlagBadge` (colored flag display), `TradingArenaDashboard` (main). Safety disclaimer always visible. Mentor flag analysis box with warning messages. Balance / equity / stats row. Reset with confirm gate.

- `src/components/academy/trading-arena/ScenarioPlayer.tsx`: Complete scenario experience. Sub-components: `PriceSparkline` (SVG line chart of scenario price history), `ScenarioCard` (list item with pass/fail badge + start button), `ActiveScenario` (briefing → trading → result phases with timer, SL/TP checking, success/failure evaluation, mentor feedback, DNA impact grid), `ScenarioList` (main with progress bar). All 6 success/failure evaluation modes implemented.

- `src/components/academy/trading-arena/JournalView.tsx`: Trade journal UI. Sub-components: `PostTradeForm` (reflection + mistake tags + lesson learned), `JournalEntryDetail` (expandable entry with pre/post sections), `MistakePatternSummary` (horizontal bar chart of most frequent mistakes), `JournalView` (main with stats row, pending reflections first, completed entries). Education note footer.

### Added — Routes

- `src/app/academy/trading-arena/page.tsx` — `/academy/trading-arena`
- `src/app/academy/trading-arena/scenarios/page.tsx` — `/academy/trading-arena/scenarios`
- `src/app/academy/trading-arena/journal/page.tsx` — `/academy/trading-arena/journal`

### Updated — Documentation

- `docs/TRADING_SIMULATOR_SPECIFICATION.md` — v2.0, Phase 17 implementation summary
- `docs/TRADING_DNA_MODEL.md` — v2.0, signal collection and blending implementation details

### Safety and Responsible Trading

- "Simulated trading" banner on every route (cannot be dismissed)
- No profit guarantees anywhere in the UI
- Mentor feedback always educational, never financial advice
- Security disclaimer in JournalView footer
- Mentor flag system warns on over-risk, no-stop-loss, revenge trades, FOMO entries
- FOMO scenario's correct answer is "zero trades" — explicitly anti-gambling

### QA Results

- TypeScript: ✓ 0 errors
- ESLint: ✓ 0 errors, 0 warnings
- Build: ✓ PASS (287 pages generated, +3 new routes)

**Tag:** `v0.17-trading-arena-v2`

---

## [v0.16] — 2026-06-27 — AI Mentor V2: Behavioral Intelligence Engine

### Added — Behavioral Engine Libraries

- `src/lib/behavioral-engine.ts`: Client-side behavioral intelligence. Computes 12 behavioral dimensions from localStorage (academy-progress + spaced-repetition + reflection entries): Discipline, Patience, Risk Management, Consistency, Reflection, Confidence, FOMO Risk, Revenge Risk, Preparation, Knowledge Depth, Decision Quality, Execution Quality. Each score includes: value 0–100, trend (up/down/stable/new), Persian explanation, evidence items, action suggestion. `loadOrComputeSnapshot()` with 5-minute localStorage cache. `DIMENSION_LABELS` and `DIMENSION_DESCRIPTIONS` lookup maps. No network calls — pure computation.

- `src/lib/knowledge-graph.ts`: Static topic prerequisite graph for Term 1 concepts (13 concept nodes, 14 prerequisite edges). Functions: `findAllPrerequisites()` (BFS traversal), `getConceptRecommendations()` (returns prioritized review recommendations when a student fails), `getConceptStatusMap()` (mastered vs. weak based on lesson scores). If student fails `scarcity-vs-price`, automatically recommends reviewing `bitcoin-supply` first.

- `src/lib/smart-review.ts`: Adaptive review scheduler combining SM-2 due cards + low-score lesson retries + knowledge graph prerequisite recommendations + missing reflections + next unstarted lesson. Returns `SmartReviewQueue` with priority-sorted items, estimated minutes, due flashcard count. Deduplicates by item ID. `buildSmartReviewQueue()` operates purely from localStorage.

- `src/lib/coaching-engine.ts`: Deterministic coaching generation — no AI API calls. Generates daily, weekly, and monthly coaching cards from behavioral snapshots. Each card includes: headline, body, why, evidence, suggestedAction, expectedImprovement, focusDimension, tone (celebrate/encourage/challenge/warn). Also generates: `generateWarnings()` (critical/important/advisory), `generateEncouragements()` (positive reinforcement), `generateReviewReminder()`. All output in Persian. Full content table for all 12 dimensions (`DIMENSION_COACHING`).

### Added — AI Mentor V2 API

- `src/app/api/ai-mentor-v2/route.ts`: Anthropic Claude API integration for behavioral coaching. CSRF-protected, rate-limited (10 req/min). Injects full behavioral context (overall score, weakest/strongest dimension, learning velocity, style, top warnings) into Claude system prompt. Sensitive data filter (Seed Phrase, private keys). Falls back to local message gracefully when `ANTHROPIC_API_KEY` is absent. Supports `claude-haiku-4-5-20251001` as default model (configurable via `ANTHROPIC_MENTOR_MODEL`). No streaming required — synchronous JSON response.

### Added — Academy V2 Components

- `src/components/academy/v2/LearningInsightsDashboard.tsx`: Premium learning insights dashboard. Components: `RadarChart` (SVG polygon, 8 behavioral dimensions), `XpProgressBar` (animated gradient progress bar), `StudyCalendar` (30-day activity heatmap), `KnowledgeMapViz` (concept nodes by lesson, color-coded mastered/weak/pending), `ProjectionCard` (completion %, graduation ETA, scholarship probability, prop qualification probability), `DimensionBar` (all 12 dimensions with trend arrows), `ReviewQueueWidget` (smart review queue with type icons). Full daily coaching card. 5-minute client-side initialization via `useRef(initialized)`. RTL layout, ARIA labels, responsive grid.

- `src/components/academy/v2/MentorV2.tsx`: Behavioral coaching interface. NOT a chatbot. Shows: overall behavioral score with strongest/weakest dimensions, daily/weekly/monthly coaching tabs (expandable with why/evidence/action/improvement), behavioral score grid (12 score pills with trend icons), weakest-dimension focus card with action, smart review queue (prioritized items with type icons), warnings (critical/important), encouragements, and "Ask Mentor" section (calls `/api/ai-mentor-v2` with full behavioral context injection, handles errors gracefully, security disclaimer). No chatbot scroll, no history list — focus on behavioral coaching.

### Added — Routes

- `src/app/academy/mentor-v2/page.tsx` — `/academy/mentor-v2` with canonical metadata
- `src/app/academy/insights/page.tsx` — `/academy/insights` with canonical metadata

### Updated

- `.env.example`: Added `ANTHROPIC_API_KEY` and `ANTHROPIC_MENTOR_MODEL` entries

### Architecture

- Behavioral engine: fully client-side (no DB, no API). Works immediately for all users.
- Knowledge graph: static (no DB). Enables automatic prerequisite recommendations.
- Coaching engine: deterministic (no AI). Generates consistent, evidence-based coaching.
- AI API: used only when student explicitly asks a question. Falls back gracefully.
- All new components: RTL, keyboard-accessible, ARIA-labeled, responsive.

### QA Results

- TypeScript: ✓ 0 errors
- ESLint: ✓ 0 errors, 0 warnings
- Build: ✓ PASS (284 pages generated, +2 new routes)

**Tag:** `v0.16-ai-mentor-v2`

---

## [v0.15] — 2026-06-27 — Academy V2: World-Class Learning Experience

### Added — Learning Engine Libraries
- `src/lib/spaced-repetition.ts`: Complete SM-2 algorithm implementation (SuperMemo 1987 — Peter Wozniak). Types: `CardState`, `ReviewGrade`. Core functions: `createCard()`, `reviewCard()`, `isDue()`, `getDueCards()`, `daysUntilReview()`. Deck persistence: `loadDeck()`, `saveDeck()`, `upsertCard()`, `ensureCards()`. Storage key: `"tecpey-sr-deck"`.
- `src/lib/academy-progress.ts`: Progress Engine — XP, streak, level (12 levels, 0–39,000 XP), lesson completion, module scores, term status, badges. Functions: `awardXp()`, `recordLessonComplete()`, `recordModuleScore()`, `passTerm()`, `awardBadge()`, `isLessonUnlocked()`, `onProgressChange()`. Custom event `"tecpey-academy-progress-updated"` for reactive UI. Storage key: `"tecpey-academy-progress-v2"`.

### Added — Curriculum Data
- `src/data/academy/term1Curriculum.ts`: Enriched Term 1 data with full TypeScript types (`Term`, `Module`, `Lesson`, `QuizQuestion`, `Flashcard`, `LessonSection`, `PracticeExercise`). 1 module, 3 fully authored lessons (درس ۱: پول و اعتماد; درس ۲: بیت‌کوین؛ درس ۳: بلاکچین). Each lesson contains: learning objectives, content sections with callouts, in-lesson knowledge checks (SM-2-graded), flashcards with front/back/example/relatedTerms, key takeaways, mentor note, practice exercise (checklist/reflection/scenario), reflection prompt, responsible trading insert, next lesson teaser. 10-question module quiz with multi-type questions. Helper functions: `extractFlashcardIds()`, `getLessonById()`, `isLessonAccessible()`.

### Added — Academy V2 Components
- `src/components/academy/v2/QuizEngineV2.tsx`: Multi-type quiz engine with mastery gate. Supported types: `single`, `multi`, `ordering` (drag-and-drop), `matching`, `fillblank`, `scenario`. Features: immediate post-answer feedback with explanation, progress bar with live %, timer, difficulty labels, ARIA labels throughout. Grading: `gradeAnswer()` handles all types including partial credit for matching. State managed via `useReducer`. Configurable pass threshold (default: 80% knowledge-check, 75% module, 70% term exam), retake cooldown, review CTA. Result screen shows pass/fail with elapsed time.
- `src/components/academy/v2/FlashcardDeck.tsx`: SM-2 flashcard component. Card flip animation with front (question) / back (answer + example). Touch swipe support (right = easy grade 5, left = hard grade 1). Grade buttons: 4 levels (نمی‌دانستم/سخت/خوب/آسان → SM-2 grades 1/3/4/5). Due-only mode and study-all mode. Session stats (reviewed, easy, medium, hard, again). Awards `XP_TABLE.FLASHCARD_SESSION` XP once per day. Session complete screen with stats. Empty state when no cards due. Related terms display. Full ARIA accessibility.
- `src/components/academy/v2/LessonPlayerV2.tsx`: Full production lesson player. 4-phase flow: `reading → knowledge-check → flashcards → quiz → complete`. Reading phase: lesson header (title, objectives, meta tags), scrollable content with live scroll progress bar, section content renderer, callout component (warning/tip/important/responsible), key takeaways, collapsible mentor note, practice exercise panel (checklist with completion feedback), reflection journal (localStorage saved), responsible trading card. XP progress widget (reactive to progress events). Knowledge-check phase: QuizEngineV2 at 80% threshold. Flashcard phase: FlashcardDeck in study-all mode. Quiz phase (mastery gate): 80% required. Complete phase: trophy screen, XP display, next-lesson CTA, reflection prompt, responsible trading reminder.
- `src/components/academy/v2/LessonPlayerV2Client.tsx`: Thin client wrapper — wires `useRouter` for next-lesson navigation.
- `src/components/academy/v2/FlashcardsPageClient.tsx`: Daily flashcard hub with due-count/total stats, two modes (mрови امروز / مرور همه), counts from live SM-2 deck.

### Added — Routes
- `src/app/academy/learn/[termSlug]/[lessonIndex]/page.tsx`: Individual lesson page with `generateStaticParams()` (pre-generates all Term 1 lessons), `generateMetadata()`, notFound() on invalid slugs.
- `src/app/academy/flashcards/page.tsx`: Daily flashcard review page with canonical metadata.

### Learning Science Implemented
- **Active Recall**: Every lesson ends with mastery-gated quiz
- **Spaced Repetition**: SM-2 algorithm with exact SuperMemo 1987 EF formula
- **Immediate Feedback**: Explanation shown after every answer
- **Mastery Learning**: 80% gate — lesson locked until passed
- **Retrieval Practice**: Knowledge checks mid-lesson before quiz
- **Micro Learning**: 8–10 min lessons, single concept focus
- **Reflection**: Per-lesson reflection journal saved to localStorage
- **Responsible Trading**: Insert in every lesson and completion screen

### QA Results
- TypeScript: ✓ 0 errors
- ESLint: ✓ 0 errors, 0 warnings
- Build: ✓ PASS (282 pages generated)

**Tag:** `v0.15-academy-v2`

---

## [v0.14] — 2026-06-27 — Global Academy Strategy & Educational Constitution

### Added — Strategic Documents (10 documents, 4,247 lines)
- `docs/ACADEMY_COMPETITIVE_BENCHMARK.md`: Benchmarks 17 global/Iranian competitors; extracts principles; defines TecPey's gap
- `docs/ACADEMY_EDUCATIONAL_STANDARD.md`: Binding educational constitution — learning science, content standards, assessment rubrics, certification criteria, ethics, privacy
- `docs/ACADEMY_CURRICULUM_BLUEPRINT.md`: Complete 7-term curriculum + 3 advanced tracks + TCP/TCM professional track
- `docs/LEARNING_EXPERIENCE_GUIDE.md`: Lesson design, flashcard SM-2, spaced repetition, revision mode, streak, motivation architecture
- `docs/TRADING_SIMULATOR_SPECIFICATION.md`: Trading Arena full spec — real feeds, journal, scenario training, discipline-weighted leaderboard, replay mode
- `docs/MENTOR_AI_MODEL.md`: AI Mentor architecture — behavioral analysis, Socratic coaching, emotional detection, weekly/monthly reports
- `docs/TRADING_DNA_MODEL.md`: Proprietary 12-dimension behavioral competence framework with weighted composite scoring
- `docs/REWARD_SYSTEM.md`: XP, levels, badges, scholarships, prop qualification pathway, fraud prevention
- `docs/GLOBAL_STRATEGY.md`: 3-phase expansion (Iran → Middle East → Global) with language, localization, and compliance frameworks
- `docs/TECPEY_UNFAIR_ADVANTAGE.md`: Product differentiation — why TecPey exists and what no competitor provides

### Changed
- `README.md`: Bilingual (fa/en), Academy structure table, complete strategic docs index, updated roadmap through Phase 20, CI badge added

**Tag:** `v0.14-academy-strategy`

---

## [v0.13.5] — 2026-06-27 — Enterprise QA Stabilization and CI Readiness

### Fixed
- `package-lock.json`: synchronized with `package.json` to resolve `npm ci` failure in GitHub Actions (`@swc/helpers@0.5.23` mismatch)
- `src/app/crypto/[symbol]/page.tsx`: removed unused `Navbar` import (ESLint `no-unused-vars`)
- `src/components/academy/AiMentorExperience.tsx`: removed unused `useMemo` import (ESLint `no-unused-vars`)
- `src/components/academy/AcademyCertificatesClient.tsx`: replaced `<img>` with `<Image>` from `next/image` for QR code display; removed stale `eslint-disable-next-line` comment

### Changed
- `eslint.config.mjs`: rule tuning carried forward from Phase 13 sessions

### CI Workflow Fix
- `.github/workflows/ci.yml`: removed global `NODE_ENV=production` (caused `npm ci` to skip devDependencies, making `tsc` and `eslint` unavailable); scoped it to the Build step only
- `.github/workflows/ci.yml`: tightened ESLint gate to `--max-warnings 0` (was 130)

### QA Results
- ESLint: ✓ 0 errors, 0 warnings
- TypeScript: ✓ 0 errors
- Build: ✓ PASS (278 pages generated)
- `npm ci`: ✓ PASS
- GitHub Actions: ✓ PASS

**Tag:** `v0.13.5-enterprise-qa`

---

## [v0.13] — 2026-06-26 — Production Hardening

### Added
- `.github/workflows/ci.yml`: GitHub Actions CI — install, TypeScript, ESLint, build on every push and PR to `main`
- `src/app/global-error.tsx`: root-level production error boundary (replaces root layout on unhandled errors)
- `next.config.ts`: `headers()` — security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control) at Next.js level for defense-in-depth
- `next.config.ts`: `experimental.inlineCss: true` — inlines Tailwind CSS into HTML, eliminates render-blocking stylesheet request for first-time visitors
- `src/app/sitemap.ts`: 7 missing English pages added (`/en/swap`, `/en/business`, `/en/careers`, `/en/compare-exchanges`, `/en/listing`, `/en/media`, `/en/partners`)

### Changed
- `next.config.ts`: `poweredByHeader: false` — removes `X-Powered-By: Next.js` fingerprinting header
- `next.config.ts`: removed stale `experimental.cpus: 4` (undocumented in Next.js 16)
- `docs/Deployment.md`: updated Node.js version to 22.x; added CI/CD section
- `docs/Roadmap.md`: Phase 13 moved to Completed; Phase 14 promoted to next planned

**Tag:** `v0.13-production-hardening`

---

## [v0.12] — 2026-06-26 — Enterprise GitHub Foundation

### Added
- Professional `README.md` with full project documentation
- `LICENSE` (proprietary, TechnoPardakht)
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `docs/Architecture.md`
- `docs/Deployment.md`
- `docs/API.md`
- `docs/Branding.md`
- `docs/Roadmap.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- GitHub remote configured and all branches/tags pushed

**Tag:** `v0.12-enterprise-foundation`

---

## [v0.11] — 2026-06-26 — Enterprise Visual Polish

### Changed
- Persian 404 page (`not-found.tsx`): full enterprise upgrade, all legacy CSS classes removed
- Persian About page (`about/page.tsx`): 15+ legacy class replacements with enterprise tokens
- `AcademyAuthClient.tsx`: password minimum validation updated to 10 characters (matches API)
- `PriceCardSkeletone.tsx`: replaced `bg-gray-600/50 animate-pulse` with `.skeleton` class
- `PriceTableSkeletone.tsx`: full enterprise skeleton refactor
- `ui/Skeleton.tsx`: enterprise `.skeleton` class, proper TypeScript props
- `ContentUI.tsx`: fixed invalid `bg-white/82` Tailwind value; ContentShell uses token-based dark mode

### Added
- `globals.css`: reduced-motion media query block for all animations
- `globals.css`: mobile safe-area inset utilities (`.pb-safe`, `.pt-safe`, `.sticky-cta-bar`)
- `globals.css`: horizontal table scroll utility (`.tp-table-scroll`)
- `globals.css`: unified form input class (`.tp-input`)
- `globals.css`: unified alert state classes (`.tp-alert-error/success/warn`)
- `globals.css`: unified badge system (`.tp-badge`, `.tp-badge-success/warn/error`)
- `globals.css`: empty state component class (`.tp-empty`)
- Mobile sticky CTAs now use `sticky-cta-bar` for iPhone notch support

**Tag:** `v0.11-enterprise-polish`

---

## [v0.10] — 2026-06-26 — Enterprise UI/UX Redesign

### Added
- Enterprise design system in `globals.css` (~200 lines): keyframes, skeleton, `.tp-card`, `.tp-btn-*`, `.tp-label`, `.tp-gradient-text`, focus rings, hover-lift, scrollbar, page transition
- `src/app/en/layout.tsx`: LTR wrapper for English subtree
- `src/app/en/not-found.tsx`: English 404 page
- English pages: `/en/about`, `/en/contact-us`, `/en/faq`, `/en/security`, `/en/fees` — full content parity with Persian equivalents
- `EnglishUI.tsx`: full rewrite with `EnglishShell`, `EnglishHero`, `EnglishCard`, `EnglishSectionLabel`, `EnglishCTA`

### Changed
- `TecpeyEnterpriseLanding.tsx`: hero CTAs updated to "ورود به صرافی" + "آکادمی رایگان" spec; MobileStickyCTA rebuilt as two equal-width buttons
- `EnglishLandingClient.tsx`: hero CTAs updated to "Enter Exchange" + "Enter Academy"; mobile sticky CTA added; stale import removed
- `HtmlLangDir.tsx`: `lang="en"` corrected to BCP 47 `"en-US"`
- `StructuredData.tsx`: added `@id` anchor to organization schema; fixed `inLanguage` to `["fa-IR", "en-US"]`

**Tag:** `v0.10-enterprise-ui`

---

## [v0.9.5] — QA Security & SEO Blockers (15 fixes)

### Security
- CSRF protection added to 20 previously unprotected state-changing API routes
- `csrf.ts`: fail-closed in production when `NEXT_PUBLIC_SITE_URL` is unset
- JWT secret fallback chain hardened — removed 4-env fallback, single secret per purpose
- Password minimum raised from 6 to 10 characters in API route
- Admin session shortened from 8 hours to 15 minutes

### SEO
- OG image paths made absolute everywhere (`https://tecpey.ir/images/...`)
- Breadcrumb fragment URL fixed (`/#academy` → `/academy`)
- Organization schema consolidated with `@id` anchor; duplicate removed from `page.tsx`
- `inLanguage` corrected to `["fa-IR", "en-US"]`

### Fixes
- `DATABASE_URL` logs clear error in production when missing or placeholder
- `/en/layout.tsx` created (LTR wrapper)
- `/en/not-found.tsx` created
- `TradingToolsClient.tsx` reformatted via Prettier

---

## [v0.1–v0.9] — Core Platform

### Included
- Next.js App Router architecture (Persian RTL primary)
- Academy: 7-term learning path, quizzes, term gates, progress tracking
- AI Mentor: context-aware educational prompt routing
- Trading Arena: practice simulator with discipline scoring
- Community career system: badges, hall of fame, career readiness
- Market board: real-time prices, swap, 50+ crypto dossiers
- Trader toolbox: 20+ analysis and risk tools
- Bilingual foundation: fa-IR + en-US routes
- SEO architecture: Schema.org, canonical URLs, structured data
- Footer, Navbar, authentication, onboarding flow
- Docker, Nginx, systemd deployment setup
