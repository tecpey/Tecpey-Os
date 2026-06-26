# TecPey Global AI Mentor TypeScript Fix QA

## Issue fixed
`npm run build` failed in `src/app/academy/layout.tsx` because `AcademyMentorFloatingCTA` was rendered with `locale="fa"`, but the compatibility component did not accept props.

## Patch
Updated:

- `src/components/academy/AcademyMentorFloatingCTA.tsx`

The component now accepts an optional `locale?: "fa" | "en"` prop and returns `null` intentionally, because the real global mentor drawer is mounted once from `src/app/layout.tsx` through `GlobalAiMentorWidget`.

## Expected result
After replacing the ZIP and running:

```bash
npm install
npm run build
```

The previous TypeScript error should be gone.

## Notes
- No UI feature was removed.
- The global floating AI Mentor drawer remains mounted globally.
- This patch only fixes the build-blocking TypeScript prop mismatch.
