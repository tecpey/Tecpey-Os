# TecPey Agent Skill Selection — 2026-09-24

## Why this exists

TecPey is a Next.js/React, PostgreSQL/RLS, multi-tenant, security-sensitive financial-education platform. Agent skills are useful only when they increase engineering leverage without creating an uncontrolled instruction or software supply chain.

This selection therefore optimizes for:

1. direct fit with TecPey's stack and active PR program;
2. reputable/inspectable upstream source;
3. bounded permissions and minimal new runtime dependencies;
4. strong testing/review/debugging discipline;
5. reproducible source pinning.

## Discovery inputs

The shortlist was cross-checked against the current Linkly/skills.sh ecosystem rankings and the upstream repositories themselves. Marketplace rank is a discovery signal, not an installation authority.

Sources:
- Linkly Skills Rankings / Top 100: https://linkly.ai/skills/
- Vercel Agent Skills: https://github.com/vercel-labs/agent-skills
- Anthropic Skills: https://github.com/anthropics/skills
- Supabase Agent Skills: https://github.com/supabase/agent-skills
- Matt Pocock Skills: https://github.com/mattpocock/skills
- Vercel Web Interface Guidelines: https://github.com/vercel-labs/web-interface-guidelines

Exact commits are recorded in `/.agents/SKILLS_LOCK.json`.

## Selected core pack

| Skill | Why TecPey needs it | Primary use |
| --- | --- | --- |
| `vercel-react-best-practices` | Next.js/React performance and server/client data-flow discipline | UI PRs, bundle/rendering reviews |
| `vercel-composition-patterns` | Prevent boolean-prop/component API sprawl | shared UI architecture |
| `vercel-react-view-transitions` | Native-feeling motion with graceful degradation | navigation/motion work, only where motion communicates state |
| `web-design-guidelines` | systematic UI/accessibility audit | review surfaces before browser evidence |
| `frontend-design` | distinctive, intentional design instead of generic SaaS card output | landing/profile/mentor/arena redesign |
| `webapp-testing` | browser reconnaissance + Playwright-style runtime validation | interactive QA and visual evidence |
| `supabase-postgres-best-practices` | schema/RLS/index/locking/concurrency guidance for Postgres anywhere | migrations, RLS, tenant isolation, query review |
| `to-spec` | turn discussions into implementation contracts | new workstream scoping |
| `domain-modeling` | sharpen overloaded financial/learning/platform language | domain vocabulary + ADR-worthy decisions |
| `codebase-design` | deep modules, clean seams and testability | interface/authority design |
| `diagnosing-bugs` | red-capable feedback loop before theory | hard CI/runtime regressions |
| `tdd` | vertical red→green slices at public seams | authority and behavior changes |
| `code-review` | separate Standards review from Spec review | PR readiness |

## Deliberately not installed

### `agent-browser`
Highly capable and highly ranked, but TecPey already has governed Playwright/public-browser evidence. Installing another Chrome/CLI execution dependency would duplicate capability and increase supply-chain/runtime surface. Reconsider only if the existing browser harness cannot cover a concrete task.

### `find-skills` / broad discovery skills
Useful interactively, but unnecessary inside the product repository. The project should not make dependency selection an autonomous runtime behavior.

### self-improving / self-learning / autonomous memory skills
Not appropriate as default repository instructions for a financial and multi-tenant platform. Learning from untrusted logs/conversations can cause instruction drift and hidden policy changes.

### unrelated cloud/framework packs
Azure, Prisma, Remotion, WordPress, mobile-only, game-engine and other high-ranking skills are intentionally excluded unless TecPey adopts the relevant technology.

### deployment skills
TecPey already has exact-SHA, signed-image, protected-environment and rollback governance. Generic deploy skills must not become a parallel release authority.

## Update protocol

1. Inspect upstream diff between the locked commit and proposed commit.
2. Confirm license and publisher/repository identity.
3. Review newly added scripts/network instructions before vendoring.
4. Update vendored files and `SKILLS_LOCK.json` in one reviewed PR.
5. Run `npm run test:agent-skills` and `npm run check`.
6. If a skill is locally hardened, preserve/reconcile the local patch explicitly.
7. Do not auto-follow upstream `main`.

## Relationship to TecPey governance

Skills improve reasoning and workflow; they do not grant authority. TecPey's program contracts, security manifests, tenant/RLS rules, release gates, explicit user approvals and exact-head CI remain authoritative.
