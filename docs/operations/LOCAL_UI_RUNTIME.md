# TecPey Local UI Runtime

## Purpose

This runbook verifies that a fresh local clone renders the actual TecPey interface rather than unstyled HTML. It covers dependency installation, environment setup, Tailwind/PostCSS, generated CSS delivery, TecPey design tokens and the custom development server.

## Supported local toolchain

- Node.js 20.11 or newer
- npm 10.x
- macOS, Linux or a compatible development environment
- PostgreSQL and Redis when testing database/queue-backed capabilities

Check versions:

```bash
node --version
npm --version
```

The repository requires npm 10. npm 11 is intentionally outside the governed range.

## Clean installation

From the repository root:

```bash
git switch main
git pull --ff-only
npm run clean
npm run npm:registry:fix
npm ci --registry=https://registry.npmjs.org/ --no-audit --no-fund
cp -n .env.example .env.local
```

Do not run the project from a parent directory or from a stale copied source tree. Confirm the current repository and branch:

```bash
pwd
git remote -v
git branch --show-current
git rev-parse HEAD
```

The expected remote is `https://github.com/tecpey/Tecpey-Os.git` and the normal local verification branch is `main` unless a specific pull request is being tested.

## Start the governed development server

```bash
npm run ui:check
npm run dev
```

Open:

```text
http://localhost:3000
```

The custom server logs a line similar to:

```text
TecPey server ready on http://localhost:3000 (development)
```

## Automated rendered-style diagnosis

Run:

```bash
npm run ui:runtime:dev
```

This command starts the real custom development server on an isolated port and verifies:

- `/` returns rendered TecPey landing HTML;
- `/markets` and `/academy/login` return public pages;
- the HTML includes stylesheet references or inline CSS;
- generated CSS is returned with a CSS content type;
- Tailwind layout/rounded-surface rules exist;
- all governed `--tp-*` design tokens exist.

For the production path:

```bash
npm run build
npm run ui:runtime:prod
```

## Manual browser diagnosis

Open browser developer tools and inspect the Network tab.

1. Reload `/` with cache disabled.
2. Filter requests by `css`.
3. Every `/_next/static/css/...` request must return HTTP 200 and `Content-Type: text/css`.
4. Inspect the root `.tecpey-enterprise` element.
5. Computed styles must include values for:
   - `--tp-bg`
   - `--tp-surface`
   - `--tp-card`
   - `--tp-text`
   - `--tp-muted`
   - `--tp-primary`
   - `--tp-border`

If the page contains content but looks like raw text, record:

```bash
node --version
npm --version
git rev-parse HEAD
npm run ui:check
npm run ui:runtime:dev
```

Also capture the browser Console and the failed CSS request from Network. Do not diagnose the problem by editing generated `.next` files.

## Safe reset

When dependencies or generated assets are stale:

```bash
rm -rf .next node_modules
npm cache verify
npm ci --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run ui:check
npm run dev
```

Do not delete `package-lock.json` during normal recovery. It is part of the governed dependency boundary.

## Common failure boundaries

### Only text is visible

Run `npm run ui:runtime:dev`. The most common boundaries are missing PostCSS/Tailwind dependencies, missing generated CSS requests, undefined TecPey design tokens or starting a stale/non-main checkout.

### Port 3000 is already in use

```bash
lsof -i :3000
kill <PID>
```

Then restart `npm run dev`.

### Environment validation fails

Copy `.env.example` to `.env.local` and configure development-safe values. Never paste real custody keys, production credentials or real user data into local files.

### Academy routes redirect

Most Academy product routes require an Academy session by design. Use `/academy/login` for the public styling smoke. Authentication redirect behavior is not evidence that CSS is missing.

## Release rule

A successful `next build` is not sufficient frontend evidence. The development and production runtime style smoke checks must pass on the exact pull-request head before a UI pipeline change is merged.
