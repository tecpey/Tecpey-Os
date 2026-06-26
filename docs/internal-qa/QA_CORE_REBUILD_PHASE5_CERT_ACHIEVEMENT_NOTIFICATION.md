# TecPey Core Rebuild Phase 5 — Certificate + Achievement + Notification Brain

## Scope
- Official Achievement OS API and UI
- Notification Brain API with return/churn scoring
- Certificate issuance now triggers official achievement/event/notification hooks
- Smart Center reads Notification Brain snapshot
- Mobile-ready channel model remains: in_app, push, email, telegram

## Production rule
Anything that affects certificate, ranking, achievement or professional path must come from server-verified events, not client claims.

## QA commands
```bash
npm run qa:phase5-core
npm run qa:core
npm run check
npm run build
```
