# TecPey Academy Mentor UX Patch QA

## Scope
This patch fixes the issues reported during local Mac testing:

1. The Persian Academy hero button `شروع آموزش رایگان` now links directly to `/academy/term-1` instead of reloading the same Academy page.
2. The English Academy hero button `Start free education` now links to `/en/academy/term-1`.
3. A clear AI Mentor CTA section was added near the top of the Persian Academy page.
4. A matching English AI Mentor CTA section was added to the English Academy page.
5. A floating Academy Mentor CTA was added across Academy routes:
   - Persian: `از مربی هوشمند بپرس`
   - English: `Ask AI Mentor`
6. On `/academy/ai-guide`, the static “نمونه گفت‌وگو” box was replaced with a direct “گفتگوی واقعی با مربی” CTA that jumps to the live mentor chat section.
7. The live mentor section now has `id="mentor-chat"` for direct navigation.
8. AI Mentor user-facing copy was cleaned up:
   - Removed technical wording like “Fallback” from the main title.
   - Replaced user-facing API error wording with a safer educational-mode message.

## Files changed
- `src/app/academy/page.tsx`
- `src/app/en/academy/page.tsx`
- `src/app/academy/ai-guide/page.tsx`
- `src/app/en/academy/ai-guide/page.tsx`
- `src/components/academy/AiMentorDemo.tsx`
- `src/components/academy/AcademyMentorFloatingCTA.tsx`
- `src/app/academy/layout.tsx`
- `src/app/en/academy/layout.tsx`

## Expected manual QA
Run on Mac:

```bash
cd ~/Desktop/tecpey_10
npm install
npm run build
npm start
```

Then test:

- `/academy` → click `شروع آموزش رایگان` → should open `/academy/term-1`.
- `/en/academy` → click `Start free education` → should open `/en/academy/term-1`.
- `/academy` → click `گفتگو با مربی هوشمند` → should open `/academy/ai-guide`.
- `/academy/ai-guide` → click `رفتن به چت با مربی` → should scroll to the live mentor chat.
- Academy pages should show floating mentor CTA on desktop.
- AI Mentor should no longer show scary technical API failure copy to users.

## Notes
This patch is intentionally focused on the UX issues found in screenshots and does not claim to implement full backend authentication, production AI Brain v2, or full community infrastructure.
