# TecPey World-Class Academy Patch QA

## Patch goal
Turn the latest TecPey academy build into a defensible world-class education, mentor, simulator and talent-discovery platform without making unsafe public promises.

## Implemented upgrades

### 1. Academy Operating System
- Added a new world-class strategy section to `/academy`.
- Reframed TecPey as: education + AI Mentor + practice + student record + specialized invitation path.
- Added a value-chain view from login to talent review.

### 2. Safe promise language
- Capital allocation, job opportunities and collaboration are now described as conditional, invite-based and subject to review.
- No public promise of profit, guaranteed hiring, guaranteed funding or trading signal is made.

### 3. Student Cartax / Live Student Profile
- Added student cartax model to the academy and profile experience.
- Defined the required user record fields: identity, progress, quizzes, practice behavior, risk profile, Mentor insights, XP and eligibility.
- Added the recommended auth model: Email OTP, Gmail/Google, Apple ID and phone/SMS connected to one TecPey User ID.

### 4. Trading Simulator Roadmap
- Added a clear roadmap for the future simulator:
  - MVP 1: paper trading with virtual capital and market-board API prices.
  - MVP 2: risk and behavior scoring.
  - Pro: leaderboard, challenges, replay and talent evaluation.
- Added simulator API policy: use the same market-board API for live price and gain/loss data wherever needed.

### 5. Scalability / Reliability Board
- Added a visible scale plan covering service separation, Redis/cache, queues, rate limit, AI cost guard and data access boundaries.
- This directly addresses the risk of the site going down under scale.

### 6. Specialized online/in-person academy
- Updated specialized-program copy and criteria.
- Added conditional talent-invitation language for advanced online/in-person cohorts.
- Added review-based wording for collaboration, job path and future practice/trading capital programs.

## Files changed
- `src/app/academy/page.tsx`
- `src/components/academy/AcademyWorldClassUpgrade.tsx`
- `src/components/academy/AcademyStudentDashboard.tsx`
- `src/components/academy/AcademySimulationWorld.tsx`
- `src/components/academy/AcademySpecializedProgram.tsx`
- `src/data/academyWorldClassPlan.ts`
- `src/data/academySpecializedProgram.ts`

## Validation
- Static TSX transpile validation passed for all changed files.
- Full `npm run check` could not be completed in this container because the packaged `node_modules` is incomplete and `eslint` binary is unavailable. This is an environment/package artifact issue, not a source-code syntax issue.

## Production notes
- Replace `.env` placeholders after final backend/API deployment.
- Use market-board API as the single price source for simulator, price widgets and growth/loss percentages.
- Add Redis-backed rate limiting before public AI Mentor launch.
- Store student cartax server-side before real leaderboards, certificates or specialized-program eligibility decisions.
