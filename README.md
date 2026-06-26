# TecPey — Your Safe Entry Point to the Crypto Market

> **A world-class Persian crypto exchange and education platform.**
> Education first. Security always. Responsible market access.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](./LICENSE)

---

## What is TecPey?

TecPey (`tecpey.ir`) is a Persian-language crypto trading platform and education ecosystem built for the Iranian market. It was created with one core belief:

> **Entering digital financial markets should be more informed, safer, and more responsible.**

TecPey combines a live crypto exchange (`my.tecpey.ir`) with a free 7-term Academy, an AI Mentor, a Trading Arena simulator, and a community career system — all in one product.

---

## Core Features

| Feature | Description |
|---------|-------------|
| **Live Exchange** | Real-time crypto markets, swap, order management at `my.tecpey.ir` |
| **Free Academy** | 7 structured terms from crypto basics to trading psychology |
| **AI Mentor** | Educational AI that answers security, risk and learning questions |
| **Trading Arena** | Safe simulation environment for practicing order decisions |
| **Market Intelligence** | 50+ crypto dossiers with risk context, on-chain and macro data |
| **Trader Toolbox** | 20+ tools: analysis, risk calculator, on-chain metrics, macro signals |
| **Community Career** | Progress tracking, badges, hall of fame, career readiness scoring |
| **Bilingual** | Full Persian (RTL, fa-IR) and English (LTR, en-US) support |
| **Security Education** | Anti-phishing, 2FA, wallet safety built into the onboarding flow |
| **Enterprise UI** | Coinbase/Stripe-quality design system with dark mode and full accessibility |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router, RSC) |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS v4, custom enterprise design tokens |
| **Database** | PostgreSQL via custom ORM layer |
| **Auth** | JWT (jose), httpOnly cookies, CSRF protection |
| **AI** | Integrated AI mentor with context-aware prompt routing |
| **SEO** | Schema.org structured data, BCP 47 locale tags, canonical URLs |
| **Deployment** | Docker, systemd, Nginx reverse proxy, Ubuntu 24 LTS |
| **Fonts** | IRANYekanX (fa-IR), Inter (en-US) |
| **Icons** | Lucide React |
| **Charts** | TradingView Widget, custom chart wrappers |

---

## Architecture Overview

```
tecpey.ir (main platform)
├── / (fa-IR, RTL) — Persian landing, markets, academy, community
├── /en (en-US, LTR) — English mirror with full parity
├── /academy/** — 7-term learning path, AI mentor, simulator
├── /markets — Live price board and swap
├── /coins/** — Individual crypto dossiers
└── /api/** — Edge-ready API routes (CSRF-protected)

my.tecpey.ir (exchange)
└── Separate trading application
```

**Key architectural decisions:**

- **App Router only** — no Pages Router. All layouts use RSC by default.
- **RTL/LTR split** — root layout is RTL (`fa-IR`). `/en` subtree wraps in LTR `<div>` via `EnglishShell`.
- **Security-first API** — every state-changing route verifies CSRF origin before processing.
- **Fail-closed defaults** — missing env secrets block requests in production rather than falling back.
- **SEO-first** — every route has canonical URL, locale-specific metadata, and Schema.org structured data.

---

## Project Structure

```
/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (fa-IR routes)      # Persian pages (RTL)
│   │   ├── en/                 # English pages (LTR)
│   │   ├── api/                # API route handlers
│   │   └── globals.css         # Enterprise design system
│   ├── components/
│   │   ├── academy/            # Academy, auth, dashboard, mentor
│   │   ├── community/          # Community career panel
│   │   ├── content/            # Content shell, hero, article cards
│   │   ├── crypto/             # Coin pages, charts, swap
│   │   ├── footer/             # Bilingual footer
│   │   ├── home/               # Landing page sections
│   │   ├── markets/            # Markets table, filters, search
│   │   ├── navbar/             # Bilingual navigation
│   │   ├── seo/                # Structured data, metadata, HtmlLangDir
│   │   ├── skeletons/          # Loading skeleton components
│   │   ├── tools/              # Trading tools client
│   │   └── ui/                 # Primitive UI components
│   ├── data/                   # Academy content, crypto data, FAQs
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Auth, CSRF, DB, rate limiting
│   └── services/               # Swap, external integrations
├── public/                     # Static assets, images, fonts
├── docs/                       # Technical documentation
├── deploy/                     # Nginx config, systemd service
├── .github/                    # Issue templates, PR template
├── docker-compose.production.yml
├── Dockerfile
└── ecosystem.config.cjs        # PM2 config
```

---

## Installation

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- npm or pnpm

### Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/tecpey/Tecpey-Os.git
cd Tecpey-Os

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.local.example .env.local
# Edit .env.local and fill in all required values

# 4. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the result.

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `TECPEY_SESSION_SECRET` | Session JWT secret (min 24 chars) |
| `TECPEY_ACADEMY_AUTH_SECRET` | Academy auth JWT secret (min 24 chars) |
| `TECPEY_ADMIN_TOKEN` | Admin panel access token (min 24 chars) |
| `NEXT_PUBLIC_SITE_URL` | Full site URL (e.g. `https://tecpey.ir`) |

See `.env.local.example` for the full list.

---

## Development

```bash
# Development server with hot reload
npm run dev

# Type checking
./node_modules/.bin/tsc --noEmit

# Linting
./node_modules/.bin/eslint .

# Build for production
npm run build

# Start production server
npm start
```

### Code Standards

- TypeScript strict mode — all new code must be type-safe
- ESLint — no new errors introduced
- No `any` casts without explicit justification
- Server Components by default — use `"use client"` only when necessary
- CSRF guard on every state-changing API route
- No hardcoded secrets — all sensitive values via environment variables

---

## Deployment

TecPey is deployed on Ubuntu 24 LTS with:

- **Docker** or **PM2** process management
- **Nginx** as reverse proxy with SSL termination
- **PostgreSQL** for persistent data

See [docs/Deployment.md](./docs/Deployment.md) for the full production deployment guide.

Quick deploy with Docker:

```bash
docker-compose -f docker-compose.production.yml up -d
```

---

## Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1–9 | Core platform, SEO, Academy, AI Mentor, Community | ✅ Complete |
| Phase 10 | Enterprise UI/UX redesign, English parity | ✅ Complete |
| Phase 11 | Enterprise visual polish, accessibility, dark mode | ✅ Complete |
| Phase 12 | GitHub foundation, documentation | ✅ Complete |
| Phase 13 | Performance audit, Core Web Vitals | 🔜 Planned |
| Phase 14 | Advanced community features | 🔜 Planned |
| Phase 15 | Mobile app (React Native) | 🔜 Planned |

See [docs/Roadmap.md](./docs/Roadmap.md) for detailed milestones.

---

## Screenshots

| Page | Preview |
|------|---------|
| Landing (fa-IR) | `public/screenshots/landing-fa.png` |
| Landing (en-US) | `public/screenshots/landing-en.png` |
| Academy | `public/screenshots/academy.png` |
| Markets | `public/screenshots/markets.png` |
| AI Mentor | `public/screenshots/mentor.png` |
| Trading Arena | `public/screenshots/arena.png` |

---

## Security

TecPey takes security seriously.

- All state-changing API routes are CSRF-protected
- JWT secrets use fail-closed defaults in production
- Admin sessions expire after 15 minutes
- Password minimum: 10 characters
- Anti-phishing education is built into the onboarding flow

To report a vulnerability, see [SECURITY.md](./SECURITY.md).

**Do not open public GitHub issues for security vulnerabilities.**

---

## Contributing

We welcome contributions. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

- Follow the existing code style and TypeScript standards
- Do not modify API security or auth logic without explicit review
- All UI changes must preserve RTL/LTR parity
- Run `tsc --noEmit` and `eslint .` before submitting

---

## License

Copyright © 2024–2026 TechnoPardakht. All rights reserved.

See [LICENSE](./LICENSE) for details.

---

## Contact

| Channel | Details |
|---------|---------|
| Website | [tecpey.ir](https://tecpey.ir) |
| Exchange | [my.tecpey.ir](https://my.tecpey.ir) |
| General Email | info@tecpey.ir |
| Support Email | support@tecpey.ir |
| Telegram | [@tecpeyco](https://t.me/tecpeyco) |
| Instagram | [@tecpeyco](https://instagram.com/tecpeyco) |
| Discord | [tecpeyex](https://discord.gg/tecpeyex) |
| Office | Babol, Mazandaran, Iran |
| Phone | +98 11 3233 8026 |

---

*Built with care in Iran. Education first. Security always.*
