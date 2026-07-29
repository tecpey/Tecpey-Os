# TecPey AI Mentor Chat Box Cleanup QA

## Scope
Final UX cleanup for the Academy AI Mentor page based on live Safari/Mac screenshots.

## Fixes Applied
- Removed the developer-facing `.env.local / OPENAI_API_KEY / CTRL+C / npm start` help box from the visible AI Mentor chat panel.
- Replaced the incorrect hero-side explanatory card text (`نمونه ثابت حذف شد...`) with a user-facing mentor ask card.
- The hero card now directly invites the learner to open the real mentor question area.
- No API key or developer setup text is exposed to the end user in the AI Mentor UI.

## Files Updated
- `src/components/academy/AiMentorDemo.tsx`
- `src/app/academy/ai-guide/page.tsx`

## Manual QA Targets
- `/academy/ai-guide`: no developer-facing API setup text visible.
- `/academy/ai-guide`: hero card is user-facing and points to the actual mentor chat section.
- Mentor suggested questions remain clickable and fill the question box before sending.
- Existing term-lock logic remains unchanged.

## Build Note
This patch is source-level clean. Run on Mac:

```bash
npm install
npm run build
npm start
```
