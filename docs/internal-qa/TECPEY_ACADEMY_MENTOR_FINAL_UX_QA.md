# TecPey Academy Mentor Final UX Patch QA

Applied fixes:

1. Term quiz completion flow
- After scoring 100%, the quiz result now shows a direct CTA to the next term.
- Term 7 routes to the final assessment.
- A secondary CTA lets the student ask the mentor after passing.

2. Mentor question UX
- Quick questions no longer auto-submit immediately.
- Clicking any suggested or quick question now places it into the textarea first.
- The textarea receives focus so the student can edit the question before sending.

3. AI Mentor API activation clarity
- API route now accepts OPENAI_API_KEY plus safe server-side aliases: OPENAI_PROJECT_API_KEY and CHATGPT_API_KEY.
- Default model updated to gpt-4o-mini for broader account compatibility.
- Setup hint now tells the operator to restart `next start` after editing `.env.local`.
- User-facing fallback wording is softer: standard educational answer instead of scary API failure.

4. Mobile UX
- Mentor input remains the clear action point.
- Suggested question buttons are usable as presets rather than surprise-send actions.

Manual Mac test checklist:
```bash
cd ~/Desktop/tecpey_10
npm run build
npm start
```
Then test:
- /academy/term-1 -> pass quiz with 100% -> button goes to /academy/term-2
- /academy/term-2 -> pass quiz with 100% -> button goes to /academy/term-3
- /academy/mentor-coach -> click suggested question -> textarea updates, does not auto-send
- Set OPENAI_API_KEY in .env.local, restart server, ask mentor -> should show API active if OpenAI account/key/model are valid
