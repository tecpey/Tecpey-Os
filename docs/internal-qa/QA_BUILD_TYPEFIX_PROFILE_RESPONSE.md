# QA Build TypeFix — Academy Profile Response

## Fixed
- Added `authenticated?: boolean` to `ProfileResponse` in `src/components/academy/AcademyOnboardingClient.tsx`.
- Normalized `/api/academy-student-profile` GET response to always return `authenticated` with profile responses and fallback responses.

## Why
Next.js production build failed at TypeScript check:

`Property 'authenticated' does not exist on type 'ProfileResponse'.`

## Expected result
`npm run build` should pass this TypeScript blocker and continue to the next build stage.
