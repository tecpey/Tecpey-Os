# Contributing to TecPey

Thank you for your interest in contributing to TecPey. This document explains how to contribute effectively and what we expect from contributors.

---

## Before You Start

TecPey is a proprietary commercial platform. Before contributing:

1. You must have written authorization from TechnoPardakht.
2. You must have signed the contributor confidentiality agreement.
3. You must not share, publish, or distribute any part of this codebase externally.

If you are an authorized employee or contractor, continue reading.

---

## Development Setup

```bash
git clone https://github.com/tecpey/Tecpey-Os.git
cd Tecpey-Os
npm install
cp .env.local.example .env.local
# Fill in all required environment variables
npm run dev
```

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code. Protected. |
| `phase-XX-stable` | Frozen milestone snapshots. Do not modify. |
| `feature/your-feature` | New features. Branch from `main`. |
| `fix/issue-description` | Bug fixes. Branch from `main`. |
| `docs/update-name` | Documentation only. |

**Never push directly to `main`.** Open a pull request and request review.

---

## Pull Request Process

1. **Branch from `main`:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make focused changes.** One PR = one concern. Do not bundle unrelated changes.

3. **Run quality checks before pushing:**
   ```bash
   ./node_modules/.bin/tsc --noEmit
   ./node_modules/.bin/eslint .
   ```
   TypeScript must report 0 errors. ESLint must not introduce new errors.

4. **Fill in the PR template completely.** Incomplete PRs will not be reviewed.

5. **Request review** from at least one maintainer.

6. **Do not merge your own PR** without approval.

---

## Code Standards

### TypeScript
- Strict mode is enabled. All new code must be fully typed.
- No `any` types without an explicit `// eslint-disable-next-line` comment and justification.
- Prefer `type` over `interface` for object shapes.

### React / Next.js
- Server Components by default. Use `"use client"` only when interactivity is required.
- No unnecessary `useEffect` for data that can be fetched server-side.
- All pages must have proper `metadata` exports (title, description, canonical).

### Styling
- Use Tailwind CSS utility classes.
- Use enterprise design tokens from `globals.css` (`tp-card`, `tp-btn-primary`, `tp-label`, etc.).
- No hardcoded hex colors outside `globals.css`.
- Dark mode must work — test both light and dark.

### Security
- Every state-changing API route (`POST`, `PATCH`, `DELETE`) must call `verifyCsrfOrigin(req)`.
- No fallback secrets. Missing env vars must fail closed in production.
- Never log passwords, tokens, or session values.
- Never commit `.env` files.

### RTL/LTR Parity
- All UI changes to Persian pages (`/`) must have an English equivalent in `/en/`.
- Test RTL layout in Persian and LTR layout in English.
- Do not use `margin-left`/`margin-right` directly — use `gap`, `ms-*`, `me-*` logical properties.

---

## Commit Message Format

```
Type: Short summary (max 72 chars)

- Detail point one
- Detail point two
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

**Examples:**
```
feat: Add dark mode toggle to navbar

fix: Correct OG image path to absolute URL

docs: Update deployment guide for Ubuntu 24
```

---

## What NOT to Touch

Unless you have explicit written approval:

- `src/lib/auth-session.ts` — session and JWT logic
- `src/lib/csrf.ts` — CSRF protection
- `src/lib/admin-auth.ts` — admin authentication
- `src/lib/db.ts` — database connection
- `src/app/api/academy/auth/**` — academy auth routes
- Any `.env*` file

---

## Reporting Issues

Use GitHub Issues with the provided templates:

- **Bug report** — for reproducible bugs
- **Feature request** — for new capabilities

For security vulnerabilities, see [SECURITY.md](./SECURITY.md). Do **not** open a public issue.

---

## Questions

Contact the maintainers at info@tecpey.ir or through official Telegram [@tecpeyco](https://t.me/tecpeyco).
