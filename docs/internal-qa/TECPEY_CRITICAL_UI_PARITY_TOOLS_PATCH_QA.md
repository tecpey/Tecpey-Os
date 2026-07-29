# TecPey Critical UI Parity + Tools Patch QA

## Fixed
- AI Mentor support area now shows only one Telegram support logo.
- Removed the empty/green second support button from Mentor.
- Removed English footer licensing/trust badge cards from English pages.
- English Home order now mirrors the Persian Home flow better:
  Hero + Market Board → Crypto News → AI Mentor → Learning Journey → Academy sections.
- Trader Toolbox rebuilt with better UI/UX:
  - More tools
  - Tool logos
  - Modal/iframe-style details after click
  - Close button
  - Official website links
  - iOS/Android links where available

## Files patched
- src/components/academy/GlobalAiMentorWidget.tsx
- src/components/footer/Footer.tsx
- src/app/en/EnglishLandingClient.tsx
- src/components/tools/TradingToolsClient.tsx
- src/app/trading-tools/page.tsx
- src/app/en/trading-tools/page.tsx

## Test
```bash
npm install
npm run build
npm start
```

## Manual QA
- Open `/academy/mentor-coach` and global Mentor drawer: only Telegram support should be visible.
- Open `/en`: no Persian/local licensing badge cards in footer.
- Compare `/` and `/en`: Home layout order should feel like translation/parity, not a separate page.
- Open `/trading-tools` and `/en/trading-tools`: click tools; modal opens and closes.
