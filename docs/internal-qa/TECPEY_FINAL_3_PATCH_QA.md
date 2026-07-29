# TecPey Final 3-Patch QA

Applied fixes:
1. AI Mentor API failover hardened:
   - Global mentor now calls `/api/ai-mentor`.
   - API returns safe educational fallback instead of raw 500 on unexpected errors.
2. Mobile safe-area adjusted:
   - Floating mentor CTA and drawer bottom offsets respect iPhone safe-area and sit above bottom CTA.
3. Academy term lock tightened:
   - Official quiz pass now requires exactly 100%.
   - Next term unlock remains tied to official quiz storage with 100% only.

Support inside mentor:
- WhatsApp: https://wa.me/989111166440
- Telegram: https://t.me/tecpey
- Links include `target="_blank"` and `rel="noopener noreferrer"`.

Recommended test:
```bash
npm install
npm run build
npm start
```

Manual QA:
- Open `/academy/term-5` before term 4 = locked.
- Pass term quiz below 100% = next term remains locked.
- Pass with 100% = next term button appears.
- Open mentor on mobile = close/minimize visible, not covering bottom CTA.
- Ask with/without `OPENAI_API_KEY` = safe answer, no technical env text.
