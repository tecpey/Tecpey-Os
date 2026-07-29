# TecPey RedTeam UI Patch QA

## Scope
Applied fixes based on latest visual QA screenshots and UX red-team notes.

## Tasks converted and completed

1. **User-facing glossary copy**
   - Removed internal/SEO/designer-facing wording from glossary hero.
   - Replaced with user-safe learning-oriented copy.
   - Replaced visible `SEO` badge with `آموزش امن / Risk-aware`.

2. **Glossary term detail UX**
   - Glossary cards no longer navigate away by default.
   - Each term opens in an in-page modal/airframe.
   - Modal includes definition, practical example, risks, common mistakes and related terms.
   - Modal is scrollable and closable.

3. **Header height / overlap reduction**
   - Navbar changed from fixed to sticky so page content no longer renders underneath it.
   - Header vertical padding, logo size, gaps and right-side spacing reduced.
   - Large desktop header is now more compact and safer for pages with tall hero sections.

4. **AI Mentor suggested questions UX**
   - Removed two visible rows of default questions from the chat footer.
   - Added one `پرسش‌های پیشنهادی / Suggested questions` button.
   - Clicking opens a compact scrollable airframe.
   - Selecting a question immediately sends it to chat and returns the answer in the chat panel.

5. **AI Mentor controls cleanup**
   - Removed duplicate minimize/close controls.
   - Kept one close button because both previous controls performed the same action.

## Files changed
- `src/components/content/GlossaryClient.tsx`
- `src/components/academy/GlobalAiMentorWidget.tsx`
- `src/components/navbar/Navbar.tsx`

## Static validation
- TypeScript transpile syntax validation passed for all changed TSX files.
- Full `npm run build` could not be completed in this environment because dependency installation timed out; run `npm ci && npm run build` on the target machine before production deploy.

## Remaining QA recommendation
- Visual-test the following pages after install:
  - `/glossary`
  - `/trading-tools`
  - `/academy`
  - homepage
  - mobile width 390px
  - tablet/iPad width 768–1024px
