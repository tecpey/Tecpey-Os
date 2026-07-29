# QA — User Journey + Smart Center Header Patch

## Scope
This patch fixes the academy journey pain points reported after local testing:

1. The user dashboard did not feel fully connected to the official academy state.
2. Term unlock flow was too dependent on device/local state.
3. The header did not expose the Smart Center only after user entry/account completion.
4. The quiz allowed repeated choices but did not sufficiently reflect wrong attempts in official scoring.

## Changes

### Header / Smart Center
- Added `مرکز هوشمند / Smart Center` CTA in the desktop header for logged-in users with a sufficiently complete profile.
- If the user is logged in but the account is not complete, header shows `تکمیل حساب / Complete account` instead.
- Mobile menu now respects logged-in state; it no longer always shows login/signup to logged-in users.
- Smart Center links to `/academy/profile` as the unified Learning OS dashboard.

### Academy Account Completion
- Term 1 onboarding now creates/syncs the official academy student profile via `/api/academy-student-profile`.
- The local lead form no longer pretends that a full learning record exists; it must sync with the official account/profile endpoint.
- Existing official profile sessions automatically unlock the quiz onboarding gate.

### Term Unlock / Dashboard
- Student Dashboard now fetches official term progress from `/api/academy-term-progress` and uses it as the primary source of truth.
- Device/local progress is only a fallback when official records are unavailable.
- Local fallback now uses `passed: true` rather than `percent === 100`.

### Quiz Behavior / Mentor Analytics
- Server-side scoring now considers the full attempt log.
- Wrong attempts reduce weighted score instead of being ignored when the final choice is correct.
- Correct answers are not revealed immediately in the UI.
- Official pass uses `ACADEMY_TERM_PASS_PERCENT` with default 80, while still requiring the final answer for every question to be correct.
- Attempt analytics now include first-try correctness and wrong-attempt count for mentor analysis.

## Remaining QA Needed on Local Machine
Run:

```bash
rm -rf node_modules .next
npm ci --no-audit --no-fund
npm run check
npm run build
```

Then manually test:

1. Anonymous user sees login/signup and no Smart Center CTA.
2. Logged-in incomplete user sees `تکمیل حساب` in header.
3. Logged-in complete user sees `مرکز هوشمند` in header.
4. Mobile menu shows the correct logged-in actions.
5. Term 1 account completion creates a profile and activates quiz.
6. Wrong answer does not reveal the correct answer.
7. Multiple wrong attempts lower weighted score.
8. Passing a term unlocks the next term through server-side progress.
9. Dashboard reflects server progress after refresh.
