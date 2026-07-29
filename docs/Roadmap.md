# TecPey — Product Roadmap

**Status: SUPERSEDED** — See `docs/MASTER_ROADMAP_v3.md` (Phase 39.5)
Reason: Roadmap consolidated into MASTER_ROADMAP_v3.md with Phase 39.5, 39.6, and restructured future phases.
This document is retained for historical reference.

## Vision

TecPey aims to be the most trusted Persian-language crypto education and trading platform — where education, security, and market access work together as one unified product.

> Every user who completes the TecPey Academy should be meaningfully better prepared than one who did not.

---

## Completed Phases

### Phase 1–3: Core Foundation
- Next.js App Router architecture
- Persian RTL layout system
- Base navigation, footer, page structure
- Initial market board and price display

### Phase 4–6: Content & Education
- Academy 7-term learning path
- Term quizzes and progress tracking
- Crypto dossiers (50+ assets)
- FAQ, glossary, educational content

### Phase 7–8: Intelligence Layer
- AI Mentor integration
- Context-aware educational prompt routing
- Trading Arena practice simulator
- Discipline scoring and mentor feedback

### Phase 9: Community & Career
- Community career panel
- Badge system and achievement tracking
- Hall of fame leaderboard
- Career readiness scoring

### Phase 9.5: Security & SEO Hardening
- CSRF protection on 20 API routes
- JWT secret hardening (fail-closed)
- Password minimum raised to 10 characters
- Admin session: 15 minutes
- OG images made absolute
- Schema.org structured data consolidated
- BCP 47 locale tags corrected

### Phase 10: Enterprise UI/UX (Complete)
- Enterprise design system (`globals.css`)
- English pages upgraded to Persian parity
- Mobile sticky dual CTA (equal-width)
- `EnglishUI.tsx` full rewrite
- All English content pages rebuilt

### Phase 11: Enterprise Polish (Complete)
- Legacy CSS classes eliminated
- Skeleton system unified
- Dark mode consistency
- Mobile safe-area insets
- Reduced-motion accessibility
- Unified alert, badge, input, empty state tokens

### Phase 12: GitHub Foundation (Complete)
- Professional README
- CHANGELOG, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT
- Full docs suite (Architecture, Deployment, API, Branding, Roadmap)
- GitHub issue and PR templates
- Repository pushed to GitHub with tags

### Phase 13: Production Hardening (Complete)
- GitHub Actions CI (install → TypeScript → ESLint → build)
- `poweredByHeader: false` — removes fingerprinting header
- Security headers at Next.js level (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control)
- `experimental.inlineCss: true` — eliminates render-blocking CSS for first-time visitors
- Removed stale `experimental.cpus: 4` config option
- 7 missing English pages added to sitemap
- `global-error.tsx` — root production error boundary
- Documentation: Deployment guide updated for Node 22 and CI/CD

---

## Planned Phases

### Phase 14: Advanced Community
**Goal:** Deepen community engagement and social learning.

### Phase 14: Advanced Community
**Goal:** Deepen community engagement and social learning.

- Public student profiles (opt-in)
- Peer learning pairs
- Community challenges with leaderboard
- Mentor endorsement system
- Learning streak rewards
- Academy graduation ceremony page

### Phase 15: Mobile Application

### Phase 15: Mobile Application
**Goal:** Native mobile experience for Persian-speaking crypto learners.

- React Native application (Expo)
- Academy lessons on mobile
- Push notifications for streaks and alerts
- Biometric authentication
- Offline lesson support
- App Store and Google Play distribution

### Phase 16: Advanced Market Tools
**Goal:** Expand the trader toolbox into a professional intelligence suite.

- On-chain data integration
- Macro signal aggregation
- Portfolio tracker (read-only, no keys required)
- Risk calculator improvements
- Market sentiment dashboard
- Alert system for price thresholds

### Phase 17: Specialized Programs
**Goal:** Launch TecPey's invitation-only advanced programs.

- Application and evaluation flow
- Mentor-led group sessions
- Advanced trading psychology curriculum
- Practicum with real market conditions
- Career placement connections

---

## Technical Debt Tracker

| Item | Priority | Notes |
|------|----------|-------|
| Navbar `<img>` → `<Image>` | Medium | ESLint warning, performance |
| Persian `contact-us/page.tsx` legacy classes | Low | Uses old CSS vars |
| Community pages legacy CSS | Low | Pre-enterprise styling |
| Dead CSS vars in `globals.css` | Cosmetic | `.about-*` classes unused |
| `middleware.ts` → `proxy.ts` rename | Low | Next.js 16 deprecated `middleware` file convention; rename to `proxy.ts` |

---

## Milestone Tags

| Tag | Description |
|-----|-------------|
| `v0.10-enterprise-ui` | Enterprise UI/UX redesign complete |
| `v0.11-enterprise-polish` | Visual polish and accessibility |
| `v0.12-enterprise-foundation` | GitHub and documentation foundation |
| `v0.13-production-hardening` | CI pipeline, security headers, SEO, performance config |

---

## Principles That Guide the Roadmap

1. **Education before engagement** — Features that improve learning quality come before features that increase time-on-site.
2. **Security before features** — No new trading feature ships before its security implications are reviewed.
3. **Persian first** — The Persian experience is the primary product. English is a parity mirror.
4. **No profit promises** — TecPey will never build features designed to pressure users into trading.
5. **Accessibility is not optional** — Every new UI component must meet WCAG AA contrast ratios and keyboard navigability.
