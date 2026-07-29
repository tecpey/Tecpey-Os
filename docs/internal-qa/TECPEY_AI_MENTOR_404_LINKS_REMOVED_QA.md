# TecPey AI Mentor 404 Links Removed QA

## Fix Summary
- Removed the Persian AI Guide suggested-question grid that linked users to incomplete/deep guide pages.
- Removed the empty/dedicated guide navigation path from the visible user journey.
- Replaced it with a direct, user-facing CTA that keeps the user on the real mentor chat section.
- Confirmed there are no remaining visible links from `/academy/ai-guide` to `/academy/ai-guide/[slug]`.

## UX Result
Users no longer click suggested questions and land on empty or 404-like pages. The intended flow is now:

`AI Guide page → Mentor chat box → User writes question → Mentor answers`

## QA Checks
- Persian AI guide no longer imports `mentorQuestionGuides`.
- Suggested-question cards with guide-page links removed.
- User-facing CTA points to `#mentor-chat` only.
- Existing dynamic guide files were left in the codebase for compatibility, but they are no longer exposed from the main mentor page.

## Additional Safety Patch
- `/academy/ai-guide/[slug]` now redirects to `/academy/ai-guide#mentor-chat` instead of rendering separate guide pages.
- This prevents old cached links or direct URLs from showing empty guide pages.
