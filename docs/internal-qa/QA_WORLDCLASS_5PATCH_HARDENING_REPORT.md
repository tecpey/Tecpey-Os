# TecPey World-Class 5-Patch Hardening QA

## Scope
Applied the next hardening layer after the 7-patch production review.

## Patch results

1. **Server-side Academy Quiz Boundary**
   - Term pages now pass quiz questions/options to the client without answers.
   - Official quiz scoring remains inside `/api/academy-term-progress`.
   - Lesson quick checks were converted to self-check/reflection prompts so no answer bank is shipped in the Academy lesson client bundle.

2. **Public Student SEO / robots**
   - `/student/[studentId]` is no longer blocked by robots rules.
   - Private routes such as `/academy/profile`, login/signup and API/storage remain disallowed.

3. **Dynamic Route QA**
   - `scripts/qa-route-check.mjs` now understands dynamic Next.js routes such as `/price/[slug]`, `/coins/[slug]`, `/student/[studentId]` and `/verify/[certificateId]`.

4. **Session Hardening**
   - Student JWT expiration changed from fixed 365 days to configurable `TECPEY_SESSION_MAX_AGE`, defaulting to `30d`.
   - Cookie maxAge changed to configurable `TECPEY_SESSION_MAX_AGE_SECONDS`, defaulting to 30 days.
   - Long-lived lead helper cookie shortened to 30 days.

5. **Simulator DB / Mentor Analytics Foundation**
   - Added `academy_simulator_decisions` table.
   - Added `/api/academy-simulator-decision` GET/POST.
   - Scenario score and feedback are resolved server-side from trusted simulation data.
   - Simulator client syncs official practice decisions to the server when the student session exists, with device fallback messaging when not configured.

## Automated checks
- `node scripts/qa-route-check.mjs`: passed.
- `node scripts/qa-production-static.mjs`: passed.
- Client-side answer-bank scan for Academy lesson components: no `correctFa`, `wrongFa`, or `q.answer` remained in app/components Academy lesson client paths.
- Build still requires installing dependencies in the target environment.

## Remaining launch check
Run before server deploy:

```bash
npm ci
npm run env:check
npm run check
npm run build
```
