# TECPEY MENTOR SUPPORT + BUILD PATCH QA

## Patch applied
- Rebuilt `src/components/academy/GlobalAiMentorWidget.tsx`.
- Fixed broken `useEffect` cleanup.
- Defined working `suggestions`, `fillSuggestion`, and `ask` logic.
- Added compact human support block inside AI Mentor drawer:
  - WhatsApp: https://wa.me/989111166440
  - Telegram: https://t.me/tecpey
- Kept AI Mentor as the only floating CTA.
- Added local chat history persistence.
- Added mobile/desktop controlled drawer sizing.
- Added safe fallback answer when API is unavailable.
- Links open in a new tab with `rel="noopener noreferrer"`.

## Validation
- `npx tsc --noEmit`: PASS
- Static source patch: PASS
- No API key added to ZIP.
- No extra floating support buttons added.

## Note
`npm run build` was started in sandbox but did not finish within the sandbox timeout. TypeScript validation passed successfully. Please run on Mac:

```bash
npm install
npm run build
npm start
```
