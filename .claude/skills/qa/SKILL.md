---
name: qa
description: Quality assurance process for TecPey. Covers code review, test-driven development, browser testing, debugging, and the mandatory QA gate before every commit. Adapted from addyosmani/agent-skills (MIT).
---

# QA Skill — TecPey

**Source:** github.com/addyosmani/agent-skills (code-review-and-quality, test-driven-development, browser-testing-with-devtools, debugging-and-error-recovery)
**License:** MIT
**Adoption:** Adopted — adapted for TecPey's mandatory 3-check QA gate
**Audit date:** 2026-06-30

---

## Mandatory QA Gate (Every Phase)

Run in this exact order. All three must pass before committing.

```bash
npm run typecheck   # tsc --noEmit — 0 errors required
npm run lint        # eslint — 0 errors, 0 warnings required
npm run build       # next build — must compile + generate all pages
```

If any step fails, **do not commit**. Fix the error, re-run from step 1.

---

## Code Review Checklist

Before marking any implementation complete, review each new/modified file for:

**Correctness**
- [ ] Does it do what the spec says, exactly?
- [ ] Does it handle the error path, not just the happy path?
- [ ] Are all inputs validated at the boundary?
- [ ] Are all DB results null-checked before use?

**Security**
- [ ] No raw SQL string concatenation
- [ ] No user-supplied values in log messages (could leak PII)
- [ ] No secret values in code (use `process.env.*`)
- [ ] CSRF check on mutating endpoints

**Performance**
- [ ] No unbounded list queries (always has LIMIT)
- [ ] No N+1 queries hidden in loops
- [ ] No synchronous heavy computation in the request path

**Maintainability**
- [ ] No code that is unreachable or dead
- [ ] No duplicate type definitions
- [ ] No backwards-compatibility hacks for code that no longer exists
- [ ] No comments describing what the code does (names should do that)
- [ ] Comments only for non-obvious WHY

**TypeScript**
- [ ] No `as any` or `as unknown as X` casts (use proper narrowing)
- [ ] No `// @ts-ignore` (fix the type, don't suppress it)
- [ ] Exported types are stable (no internal implementation leaking through)

---

## Test-Driven Development

For new services and validation functions, write the failure case first:

1. Name what can go wrong (invalid input, DB unavailable, auth missing)
2. Write a test that asserts the error response
3. Write the implementation until the test passes
4. Add the success case test
5. Refactor without breaking tests

TecPey does not yet have a unit test suite. Until it does:
- Validate manually via `curl` or a REST client after each endpoint is written
- Document the manual test steps in the phase report
- Flag any endpoint that would benefit from automated testing in the "remaining gaps" section

---

## Debugging Protocol

When a `npm run typecheck` or `npm run lint` or `npm run build` step fails:

1. Read the full error message — do not skim
2. Identify the exact file and line number
3. Check if the error is a type mismatch, a missing import, or a wrong API usage
4. Fix the root cause — do not suppress with `// @ts-ignore` or `eslint-disable`
5. Re-run from step 1 of the QA gate

When a runtime error occurs:

1. Check `src/lib/logger` output for the structured log with `requestId`
2. Identify the `route` and `latencyMs` to narrow down where it occurred
3. Check `withDb().enabled` — if false, the DB is unavailable, not the code broken
4. Check `getCanonicalSession()` return — if no userId/studentId, auth is failing upstream

---

## ESLint Config (TecPey)

Configuration is in `eslint.config.mjs`. Key rules active:
- TypeScript strict mode
- Unused variables are errors (not warnings)
- `no-var` is NOT active for TS files (so `declare global { var ... }` is fine)

Do not add `// eslint-disable` directives without confirming the rule is
actually triggering a false positive. Remove any `eslint-disable` where the
rule no longer fires.

---

## Build Output Interpretation

After `npm run build`:

| Symbol | Meaning |
|---|---|
| `○` | Static (prerendered at build time) |
| `ƒ` | Dynamic (server-rendered per request) |

All API routes should be `ƒ`. If a route appears as `○`, confirm `export const dynamic = "force-dynamic"` is present.
