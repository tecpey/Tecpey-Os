---
name: engineering
description: Production-grade engineering process for TecPey. Covers spec-driven development, incremental implementation, code simplification, git workflow, CI/CD, observability, documentation, and deprecation. Adapted from addyosmani/agent-skills (MIT).
---

# Engineering Skills — TecPey

**Source:** github.com/addyosmani/agent-skills (selected skills)
**License:** MIT
**Adoption:** Partial — relevant skills extracted; hooks NOT installed; session-start.sh NOT installed
**Audit date:** 2026-06-30

---

## Spec-Driven Development

Before writing any code, confirm:

1. The spec is written and agreed upon with the user
2. The spec names the exact files to create or modify
3. The spec names the exact API contracts (request/response shapes)
4. The spec names the exact DB tables and migration number
5. Edge cases and error responses are specified

**Never derive the spec from assumptions.** If the spec is ambiguous, ask
before implementing — not after.

---

## Incremental Implementation

Apply this order for every phase:

1. Types and interfaces first (no runtime code yet)
2. Services and pure functions (logic without I/O)
3. Database layer (migrations, then query functions)
4. API routes (wire services to HTTP)
5. QA: typecheck → lint → build (in that order)
6. Documentation
7. Commit

Do not write step N+1 until step N compiles without errors.

---

## Code Simplification

Before finalizing any implementation:

- Remove code that was written and then superseded
- Remove debug logging that was added during development
- Remove `TODO` comments that are not tracked as phase tasks
- Remove dead branches (unreachable `if` arms)
- Remove re-exports that are not used by any consumer
- Consolidate duplicate type definitions

**Do not** simplify by removing necessary error handling, necessary validation,
or intentional safety checks.

---

## Git Workflow (TecPey)

```
git add <specific-files>          # never git add -A
git commit -m "Phase N.X: ..."    # with Co-Authored-By line
git tag vN.X-slug
git push origin main
git push origin vN.X-slug
```

Commit message rules:
- First line: `Phase N.X: <what changed>` (≤72 chars)
- Body: bullets describing the key changes
- Last line: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

Never amend a pushed commit. Never force-push without explicit permission.
Never use `--no-verify`.

---

## CI/CD

GitHub Actions must be green before starting any new phase.

After every push, verify:
- TypeScript check passes
- ESLint passes
- Build succeeds
- No new environment variables were added without updating `.env.example`

---

## Observability Pattern

Every new API route must:

```typescript
import { withObservability } from "@/lib/observe";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/route-name" }, async () => {
    // handler body
  });
}
```

Structured log for mutating operations:
```typescript
logger.info("[module] action description", {
  requestId: req.headers.get("x-tecpey-request-id") ?? undefined,
  userId,
  // domain-specific fields (orderId, market, etc.)
  latencyMs: Date.now() - start,
});
```

---

## Documentation Rules

Every phase must produce or update:
- `CHANGELOG.md` — concise entry with subsections (Added, Changed, Fixed)
- Relevant `docs/*.md` — architecture, API reference, decision rationale
- No implementation-detail comments in code — the why belongs in docs

---

## Deprecation and Migration

When removing or replacing infrastructure:
- Write the replacement first
- Migrate callers
- Remove the old code in the same commit (not a future "cleanup" phase)
- Add a migration entry to `CHANGELOG.md`
- Run `npm run typecheck` to confirm all callers are gone

---

## API and Interface Design

New API routes checklist:
- [ ] Idempotent where possible (GET is always idempotent)
- [ ] Returns consistent shape: `{ ok: true, ... }` via `apiOk()`
- [ ] Returns consistent error shape via `apiError(code, status)`
- [ ] Rate-limited with appropriate namespace and window
- [ ] CSRF-protected for all mutating methods
- [ ] Authenticated where user data is involved
- [ ] Paginated for list endpoints (default and max limit enforced)
- [ ] Input size capped (body size check before parsing)
