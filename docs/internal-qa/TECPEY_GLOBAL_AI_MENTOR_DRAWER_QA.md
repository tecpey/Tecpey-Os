# TecPey Global AI Mentor Drawer QA

## Patch scope
- Added a global floating AI Mentor widget to the root layout so it appears on all pages.
- The button no longer navigates away from the current page.
- Clicking the button opens a compact chat drawer/bottom-sheet over the current page.
- The drawer keeps the user on the same page and does not interrupt reading.
- The mentor receives the current route context: academy, term pages, markets, security, crypto news, coin pages, etc.
- The chat history is stored locally per language to allow continuation during the session.
- Suggested questions now fill the chat input instead of navigating to incomplete pages.
- The old academy-only floating CTA was neutralized to avoid duplicate buttons.
- FA and EN labels are supported.

## UX checks
- Mobile safe-area bottom position: applied.
- Desktop floating drawer width: capped at 420px.
- Mobile bottom-sheet height: capped via max-height and scroll.
- z-index increased above content/footer cards.
- Financial advice disclaimer included.
- Seed phrase / password / API key warning included.

## Files changed
- src/components/academy/GlobalAiMentorWidget.tsx
- src/components/academy/AcademyMentorFloatingCTA.tsx
- src/app/layout.tsx

## Local test command
npm install
npm run build
npm start

## Manual test checklist
1. Open `/` and confirm the mentor button is visible.
2. Open `/academy`, `/academy/term-1`, `/markets`, `/security`, `/crypto-news` and confirm the same button exists.
3. Tap the button on mobile view and confirm the drawer opens without leaving the page.
4. Click a suggested question and confirm it fills the chat input.
5. Send a question and confirm either OpenAI response or safe educational fallback appears.
6. Close/minimize the drawer and continue reading the same page.
