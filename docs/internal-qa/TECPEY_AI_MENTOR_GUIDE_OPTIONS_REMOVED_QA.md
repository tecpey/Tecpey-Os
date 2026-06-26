# TecPey AI Mentor Guide Options Removed QA

## Patch target
Removed misleading guide-page CTAs from the AI Mentor UI.

## Real changes
- Removed `صفحه راهنما` buttons from the quick question list.
- Removed `راهنمای کامل این سؤال` buttons from suggested next questions.
- Suggested questions now only fill the textarea so the user can edit and send the question.
- Quick questions now behave as clean selectable prompts, not links to unfinished/empty pages.
- Removed unused mentor guide import and lookup logic from `src/components/academy/AiMentorDemo.tsx`.

## UX outcome
- No empty guide pages are promoted from the Mentor UI.
- The Mentor area now has one clear behavior: pick a question, edit if needed, then send it to the educational mentor.

## Manual QA checklist
- Open `/academy/ai-guide`.
- Scroll to the AI Mentor chat area.
- Confirm no `صفحه راهنما` button appears under quick questions.
- Confirm no `راهنمای کامل این سؤال` button appears under suggested questions.
- Click a suggested question and confirm it fills the textarea instead of navigating.
- Click `پرسیدن سؤال آموزشی` and confirm mentor response/fallback works.

## API note
For live AI responses, the key must be placed in `.env.local`, not `.env.local.example`, then the dev/production server must be restarted.
