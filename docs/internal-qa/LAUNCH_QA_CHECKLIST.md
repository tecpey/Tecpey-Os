# TecPey Launch QA Checklist

## Server
- Install Node.js LTS.
- Run `npm ci`.
- Copy `.env.production.example` to `.env.production`.
- Set `DATABASE_URL` for Postgres lead storage.
- Optionally set `ACADEMY_LEADS_WEBHOOK_URL` for CRM copy.
- Run `npm run build`.
- Run `npm start -- -p 3000`.

## Required live tests
- Open `/`
- Open `/academy`
- Open `/academy/term-1`
- Open `/academy/term-7`
- Open `/academy/profile`
- Open `/en/academy/profile`
- Open `/sitemap.xml`
- Submit academy lead form.
- Confirm cookie `tecpey_academy_lead_saved`.
- Confirm row in `academy_leads` table or fallback `storage/academy-leads.jsonl`.

## Mobile QA
- iPhone Safari
- Android Chrome
- Dark mode
- Light mode
- Video modal open/close/fullscreen
- Mini quiz selection
- Progress/XP persistence after refresh
