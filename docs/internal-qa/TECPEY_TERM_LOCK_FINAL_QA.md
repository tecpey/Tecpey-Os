# TecPey Academy Term Lock Final UX Patch QA

## Scope
This patch fixes the academy progression bugs reported from real localhost testing.

## Fixed
- Term roadmap no longer treats reading progress as official unlock progress.
- Official term unlock now requires the previous end-of-term quiz to have a numeric score and exactly 100%.
- Lesson/player reading progress now writes to `tecpey-academy-reading-term-N` instead of overwriting `tecpey-academy-term-N`.
- Direct access to `/academy/term-2` through `/academy/term-7` is now blocked by `TermAccessGuard` until the previous official quiz is completed with 100%.
- Case Study Lab cards now use `TermGateLink`; locked term cards no longer bypass the learning path.
- Bottom Academy CTA pointing to Term 7 now respects the same lock rule.
- Term roadmap locked cards show `قفل` and 0% instead of misleading old progress.
- Progress update event is dispatched after official quiz completion so roadmap updates immediately.

## Important behavior
- Reading lessons can show learning progress, but it cannot unlock later terms.
- Only the official quiz key with a numeric `score` and `percent === 100` can unlock the next term.
- Old corrupted localStorage records created by the lesson player are ignored unless they contain an official numeric quiz score.

## Manual QA Checklist
1. Clear browser localStorage or test with existing data.
2. Open `/academy`.
3. Term 1 should be open.
4. Terms 2-7 should remain locked until the previous official quiz is 100%.
5. Open `/academy/term-5` directly before completing Term 4 quiz: user should see the lock screen.
6. Complete Term 1 quiz with less than 100%: Term 2 remains locked.
7. Complete Term 1 quiz with 100%: Term 2 opens and roadmap updates.
8. Case Study cards for higher terms should not bypass locks.

## Build note
Sandbox could not run `npm run build` because `node_modules` is not available in this execution environment. The code changes are limited to existing React/Next components and should be tested on Mac with:

```bash
npm install
npm run build
npm start
```
