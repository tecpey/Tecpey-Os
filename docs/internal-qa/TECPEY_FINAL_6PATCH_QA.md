# TecPey Final 6 Patch QA

Applied real patches:
1. Crypto Wiki dataset expanded to 160 SEO-ready terms.
2. `/glossary/[slug]` and `/en/glossary/[slug]` rebuilt with dedicated term pages, SEO metadata, FAQ schema and related terms.
3. Glossary live search polished and cards link to SEO pages.
4. Trading Tools expanded to 37 tools with favicon/logo, article, pros/cons, tutorial, official links and app links where available.
5. Exchange Compare expanded to 20 Iranian/global exchanges with richer comparison columns.
6. AI Mentor support cleaned/enforced to Telegram-only where detected.

Validation:
- `npx tsc --noEmit`: PASS in sandbox.
- `next build`: should be run on target machine/server. Sandbox build environment timed out during Next page-data phase, while the same project already built successfully on Mac in the paired terminal.

Test commands:
```bash
npm install
npm run build
npm start
```

Important QA pages:
- /glossary
- /glossary/fvg
- /glossary/funding-rate
- /trading-tools
- /compare-exchanges
- /en/glossary/bitcoin
