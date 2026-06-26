# TecPey Mobile Auth + Academy CTA Patch QA

## Applied fixes
- Mobile sticky CTA on the landing page no longer shows separate Login / Signup buttons.
- Mobile sticky CTA now shows one clear action: `ورود به آکادمی رایگان`.
- The global AI Mentor floating button is moved above the mobile sticky CTA so it does not cover the action button.
- `/signin` and `/signup` routes no longer 404; they redirect to the free academy path.
- `/login` no longer contains hardcoded mock credentials and now presents a safe academy-first entry page.

## QA target
- Mobile UX: mentor CTA visible and not overlapping primary CTA.
- Auth routes: no 404 for `/login`, `/signin`, `/signup`.
- Security: mock credential removed.
