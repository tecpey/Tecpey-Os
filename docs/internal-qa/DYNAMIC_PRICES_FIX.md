# Dynamic prices fix

This build connects the following sections to the same live currency API/socket flow used by the Persian market board:

- Persian home market device card
- English home market board
- English markets page

Important implementation notes:
- `src/app/home/enterprise/TecpeyEnterpriseLanding.tsx` now calculates IRT prices from `priceData.last * USDT_IRT` when direct IRT price is not available.
- `src/app/en/markets/page.tsx` now uses `useBaseCurrenciesPrice` directly, so websocket/live updates are not bypassed by a separate static query.
- `src/app/en/EnglishLandingClient.tsx` uses the same live price field fallbacks and clearer loading text.

Install:
```bash
rm -rf node_modules package-lock.json
npm install --registry=https://registry.npmjs.org/
npm run build
npm start
```
