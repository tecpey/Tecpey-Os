# TecPey Agent Skills Pack v1

This pack installs a deliberately small set of project-level agent skills under `.agents/skills/` so Codex-compatible agents working on TecPey share the same engineering guidance.

## Selection method

The shortlist was chosen from current Linkly/skills.sh rankings and primary publisher repositories, then filtered for TecPey's real stack and risk profile. Popularity alone was not sufficient.

Selected skills:

1. **vercel-react-best-practices** — Next.js/React performance, async waterfall elimination, server/client rendering and bundle discipline.
2. **vercel-composition-patterns** — scalable React composition and API design.
3. **web-design-guidelines** — current UI/accessibility/interaction review.
4. **frontend-design** — intentional, non-generic visual design.
5. **security-review** — high-confidence security review from GitHub's skill collection.
6. **agent-browser** — exploratory browser QA, screenshots, React introspection and Web Vitals.
7. **diagnosing-bugs** — deterministic feedback-loop and root-cause debugging discipline.
8. **postgres-best-practices** — vendor-neutral PostgreSQL 14–18 schema/query/indexing/transaction/security practices.

## Why some popular skills were not installed

- **find-skills:** useful for discovery, but not a day-to-day TecPey implementation rule and can expand scope unpredictably.
- **deploy-to-vercel / Vercel deployment skills:** TecPey's governed runtime is Ubuntu/systemd/staging, not Vercel.
- **Better Auth skills:** TecPey already has a custom governed auth/session/OTP/TOTP architecture; generic framework migration advice could conflict with it.
- **Generic “implement everything” / autonomous-loop packs:** too broad and can compete with TecPey's exact-head, PR, review and release governance.
- **OWASP security-guidance pack:** valuable reference, but its skill depends on a large shared ASVS data tree; the project already has ASVS-based #719 governance and a self-contained GitHub security-review skill. It can be added later as a separately reviewed security pack if desired.
- **Supabase-specific database skill:** TecPey uses PostgreSQL directly; the selected Neon skill is more vendor-neutral. Supabase's Postgres skill remains available in this ChatGPT environment when needed.

## Governance

The source and exact upstream commit for every skill are pinned in `.agents/skills/tecpey-sources.json`.

A skill may guide implementation; it cannot:
- authorize merge/deploy;
- weaken tenant/RLS/auth/payment/custody controls;
- override repository contracts;
- invent product authority;
- change Production release boundaries;
- turn model output into trading, KYC, payment, entitlement or animation authority.

When generic advice conflicts with TecPey's documented architecture, TecPey's repository contract wins.

## Update process

1. Review the upstream skill diff from the pinned commit to the proposed new commit.
2. Reject instructions that widen authority, require unrelated external access, or conflict with TecPey governance.
3. Replace the vendored skill files in one dedicated PR.
4. Update `tecpey-sources.json`.
5. Run `npm run agent-skills:verify`.
6. Require normal exact-head CI/review before merge.

## Agent Browser prerequisite

The installed `agent-browser` skill is a discovery skill. Its runtime guide is served by the matching CLI version. Agents may use `npx agent-browser` or a preinstalled `agent-browser` only when the current execution environment permits it; this skill does not grant shell/browser permissions by itself.
