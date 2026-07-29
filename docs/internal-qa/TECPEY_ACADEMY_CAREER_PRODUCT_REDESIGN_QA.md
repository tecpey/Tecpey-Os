# TecPey Academy Career Product Redesign — QA / RedTeam

## Scope
This patch upgrades the academy from a prototype-like learning area into a product-grade learning and career-readiness experience.

## Files changed
- `src/components/academy/AcademyStudentDashboard.tsx`
- `src/components/academy/AcademySimulationWorld.tsx`
- `src/components/academy/GlobalAiMentorWidget.tsx`
- `src/components/academy/AiMentorDemo.tsx`
- `src/components/academy/AcademyMentorCoachCenter.tsx`
- `src/components/academy/AcademyInteractiveRoadmap.tsx`
- `src/components/academy/AcademyLessonPlayer.tsx`
- `src/app/academy/evaluation/page.tsx`
- `src/app/academy/ai-guide/page.tsx`

## RedTeam findings addressed

### 1. Student Dashboard looked like a prototype
**Fix:** Rebuilt the dashboard as a product-grade `Learning Record` with:
- current level
- overall progress
- learning XP
- completed terms
- estimated rank
- personalized next step
- learning identity
- 7-term progress map
- badge system
- AI mentor entry
- market decision practice entry
- certificate/specialized path language

### 2. Internal roadmap/build language leaked into user experience
**Fix:** Removed or replaced internal-facing language such as:
- MVP / prototype / beta / coming soon style wording
- developer-facing configuration language
- public references to implementation state
- content-production notes in video descriptions

### 3. Simulator felt like a future feature rather than a real academy tool
**Fix:** Reframed simulator as `Market Decision Practice`:
- educational scenarios
- risk behavior
- emotion and decision assessment
- market-board data alignment without buy/sell advice
- learning journal framing

### 4. AI Mentor had overly technical identity markers
**Fix:** Reframed visible mentor identity from technical AI/status language to:
- Learning Mentor
- Learning profile
- Learning readiness
- safe personalization
- no signals, no profit promises, no private credentials

### 5. Career promise needed legally safer wording
**Fix:** Specialized path text now states:
- review is conditional
- online/in-person specialized programs are invitation/review based
- collaboration opportunities and practice capital are only for qualified users after assessment and capacity review

## Static QA checks
- User-facing academy files scanned for: MVP, prototype, beta, coming soon, TODO, FIXME, DATABASE_URL, API Key, creator-facing text, preview/certificate placeholder language.
- Remaining `نمایشی` occurrence is in the phrase `پرهیز از اصطلاحات نمایشی`, which is safe and user-facing.
- No public academy UI text should expose raw database configuration, OpenAI configuration, local fallback status, internal roadmap, or content-production notes.

## Build status
Dependency install/build could not be completed in this environment because `node_modules` is not present and dependency installation timed out/failed at container level.
Before production deploy run:

```bash
npm ci
npm run check
npm run build
```

## Production deploy gate
Do not deploy unless:
- `npm run build` passes.
- `/academy/profile` renders on desktop and mobile.
- `/academy/simulator` renders on desktop and mobile.
- Floating mentor opens, suggested questions send into chat, and close/minimize remains single-action.
- No UI shows implementation words such as MVP, prototype, beta, TODO, DATABASE_URL, API Key, or developer notes.
