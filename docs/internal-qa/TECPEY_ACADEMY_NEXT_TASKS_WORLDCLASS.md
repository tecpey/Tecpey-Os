# TecPey Academy Next Tasks — World-Class Execution Board

## P0 — before production launch
1. Confirm all `.env` values: backend API, socket URL, OpenAI key, public domain.
2. Add rate limit to AI Mentor and lead forms.
3. Add health checks for site, backend, socket and Mentor API.
4. Ensure all academy links return 200.
5. Add backup and rollback command to deployment checklist.

## P1 — student cartax backend
1. Create `users` table with one immutable TecPey User ID.
2. Create `auth_identities` table for email, Google, Apple and phone.
3. Create `academy_profiles` table for progress, XP, level, city and consent.
4. Create `academy_events` table for lesson view, quiz answer, practice decision and Mentor session.
5. Create `mentor_reports` table for weaknesses, recommendations and eligibility flags.

## P2 — Trading Arena MVP
1. Use market-board API as the only live price source.
2. Create virtual wallet balance per student.
3. Add market buy/sell, P/L, order history and journal.
4. Add basic risk score: position size, loss streak, drawdown and overtrading.
5. Send simulator summary to Mentor context.

## P3 — specialized academy and talent path
1. Define exact entry thresholds.
2. Add manual review panel for academy admins.
3. Add cohort capacity management.
4. Add conditional invite email/SMS templates.
5. Add legal disclaimer for job/collaboration/capital review path.

## P4 — scale hardening
1. Separate AI Mentor service from landing frontend.
2. Add Redis cache and queue workers.
3. Add CDN and static caching rules.
4. Add monitoring: uptime, error rate, API latency, socket disconnects.
5. Add database indexes for academy events and user profile reads.
