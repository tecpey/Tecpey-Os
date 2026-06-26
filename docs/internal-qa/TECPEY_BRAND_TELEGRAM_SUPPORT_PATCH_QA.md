# TecPey Brand + Telegram Support Patch QA

Source ZIP: `suptecpey-final-term1-10x-academy-memory-streaming-final.zip`

## Applied
- Replaced legacy brand references:
  - `تکنو پرداخت`, `تکنوپرداخت`
  - `Tecno Pardakht`, `TecnoPardakht`, `technopardakht`
  - with `تک‌پی` / `TecPey`
- AI Mentor support area cleaned to Telegram-only.
- WhatsApp support link removed from Mentor widget where detected.
- Telegram link enforced:
  - `https://t.me/tecpey`
  - `target="_blank"`
  - `rel="noopener noreferrer"`

## Patch stats
- Brand replacements count: 6
- Files with brand replacements: 4
- Mentor files patched: 1

## Files touched by brand patch
- src/app/page.tsx
- src/i18n/messages/fa.json
- src/components/footer/Footer.tsx
- src/app/contact-us/page.tsx

## Mentor files patched
- src/components/academy/GlobalAiMentorWidget.tsx

## Mac test
```bash
npm install
npm run build
npm start
```

## Manual QA
- Search project for `تکنو پرداخت`, `Tecno Pardakht`, `TecnoPardakht`, `technopardakht`.
- Open AI Mentor drawer.
- Confirm only Telegram support appears under chat.
- Confirm Telegram opens `https://t.me/tecpey`.
