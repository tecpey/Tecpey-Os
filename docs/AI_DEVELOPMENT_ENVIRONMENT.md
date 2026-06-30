# TecPey AI Development Environment

Phase 28.5 — Claude Skills & AI Development Environment

---

## Overview

This document describes the Claude skills installed in `.claude/skills/`, their
audit status, how Claude should use each one, and the process for adding or
removing skills in the future.

---

## Skills Directory

```
.claude/
└── skills/
    ├── tecpey/         — TecPey Enterprise Skill (PRIMARY — always active)
    ├── ui-ux-pro/      — UI/UX design intelligence (ADOPTED)
    ├── impeccable/     — Design quality audit (ADOPTED)
    ├── motion-framer/  — Framer Motion patterns (DEFERRED)
    ├── engineering/    — Engineering process (ADOPTED — partial from agent-skills)
    ├── security/       — Security hardening (ADOPTED — partial from agent-skills)
    ├── performance/    — Performance optimization (ADOPTED — partial from agent-skills)
    └── qa/             — QA and code review (ADOPTED — partial from agent-skills)
```

---

## Audit Results

### 1. TecPey Enterprise Skill — `tecpey/SKILL.md`

| Property | Value |
|---|---|
| Source | TecPey internal (written for this project) |
| License | N/A — project-internal |
| Adoption | **ADOPTED — PRIMARY** |
| Modifies code | No |
| Adds dependencies | No |
| Adds hooks | No |

**What it does:** Encodes TecPey-specific rules — platform track architecture,
engineering quality gates, Next.js 16 conventions, brand/logo rules, UX
constraints, product strategy rules, and the 7-step phase workflow.

**How Claude uses it:** This is the primary reference skill. Load it at the
start of every TecPey work session. All other skills must be compatible with
the constraints defined here.

---

### 2. UI/UX Pro Max — `ui-ux-pro/SKILL.md`

| Property | Value |
|---|---|
| Source | github.com/nextlevelbuilder/ui-ux-pro-max-skill |
| License | MIT |
| Adoption | **ADOPTED (reference only)** |
| Modifies code | No |
| Adds dependencies | No (Python scripts not installed — reference SKILL.md only) |
| Adds hooks | No |
| Compatible | Yes — has Next.js + Tailwind + shadcn stack guidance |
| Security risk | None |
| Maintainability risk | Low |

**What it does:** Provides searchable design intelligence covering UI styles,
color palettes, font pairings, chart recommendations, and UX best practices.
The full skill includes a Python BM25 search engine over CSV design databases,
but only the conceptual guidance has been extracted into a TecPey-adapted
SKILL.md.

**How Claude uses it:** When asked to design, review, or critique UI, consult
this skill for style/palette/typography/chart guidance appropriate to TecPey's
fintech and edtech contexts.

**What was NOT installed:** Python scripts, CSV databases, CLI installer, npm
package. If the full search engine is needed in the future, run:
```bash
npx ui-ux-pro-max-cli init
```
in a separate tooling directory (not the project root).

---

### 3. Impeccable — `impeccable/SKILL.md`

| Property | Value |
|---|---|
| Source | github.com/pbakaus/impeccable |
| License | Apache 2.0 |
| Adoption | **ADOPTED (reference only)** |
| Modifies code | No |
| Adds dependencies | No (Astro site, Bun scripts, and Cloudflare deployment are the author's project — not installed) |
| Adds hooks | No (hooks exist in the source repo but were NOT copied) |
| Compatible | Yes |
| Security risk | None |
| Maintainability risk | Low |

**What it does:** A 23-command design quality system. Commands include
`/impeccable audit`, `polish`, `colorize`, `typeset`, `layout`, `animate`,
`quieter`, `bolder`, `critique`. Establishes the brand vs. product register
distinction.

**How Claude uses it:** When reviewing or polishing TecPey UI components,
invoke impeccable commands as a design audit lens. All output is
recommendations only — never auto-applied.

**What was NOT installed:** Astro site, bun.lock, Cloudflare Workers config,
OG image generator, skills-lock.json, SKILL.src.md build pipeline. Only the
conceptual command set and design laws were extracted.

**Source repo note:** The `impeccable` repo's own CLAUDE.md and DESIGN.md
describe how to build and deploy the *impeccable website*, not how to use it
as a skill. What matters for TecPey is the skill command set and design
principles, extracted into `.claude/skills/impeccable/SKILL.md`.

---

### 4. Motion Framer — `motion-framer/SKILL.md`

| Property | Value |
|---|---|
| Source | github.com/freshtechbro/claudedesignskills |
| License | Not confirmed |
| Adoption | **DEFERRED** |
| Modifies code | Only when invoked — but dep not installed |
| Adds dependencies | Would require `npm install framer-motion` |
| Adds hooks | No |
| Security risk | Low |
| Maintainability risk | Medium (dep not installed; license unconfirmed) |

**Reason for deferral:**
1. `framer-motion` is not in TecPey's `package.json`
2. TecPey UX rule: "No unnecessary animation"
3. Exchange/trading surfaces must not animate (price legibility)
4. License of source repo could not be confirmed

**Activation path:** If the user explicitly approves adding Framer Motion for
a specific surface (e.g., Academy certificate reveal), install the dep, confirm
license, and activate this skill.

---

### 5. Addy Osmani Agent Skills — `engineering/`, `security/`, `performance/`, `qa/`

| Property | Value |
|---|---|
| Source | github.com/addyosmani/agent-skills |
| License | MIT |
| Adoption | **PARTIAL ADOPT** |
| Modifies code | No (guidance only) |
| Adds dependencies | No |
| Adds hooks | **NOT INSTALLED** (hooks exist in source but were deliberately excluded) |
| Compatible | Yes |
| Security risk | Low (hooks were the only risk — excluded) |
| Maintainability risk | Low |

**What was installed:** 4 derived SKILL.md files covering engineering process,
security hardening, performance optimization, and QA — all adapted for
TecPey's stack, conventions, and phase workflow.

**What was NOT installed:**
- `hooks/hooks.json` — defines a `SessionStart` hook running `session-start.sh`
- `hooks/session-start.sh` — runs on every Claude session start
- `hooks/sdd-cache-pre.sh` / `sdd-cache-post.sh` — spec-driven development cache
- `hooks/simplify-ignore.sh` — code simplification ignore list
- `.claude/commands/` — slash commands (/spec, /plan, /build, /test, /review, /ship)

**Why hooks were excluded:** The session-start hook runs a shell script on
every Claude session start, which modifies global session state. Without
reviewing the exact script content and confirming it is safe for TecPey's
environment, installing session-level hooks introduces unacceptable risk of
interfering with the project's existing settings.local.json and workflow.

**Activation path for hooks:** If the user wants to install the agent-skills
hooks, review `hooks/session-start.sh` manually, confirm it is safe, and add
it explicitly to `.claude/settings.local.json`.

**How Claude uses these skills:**
- `engineering/` — reference during implementation phases for process discipline
- `security/` — reference when writing API routes or handling auth/financial data
- `performance/` — reference when optimizing routes or reviewing bundle size
- `qa/` — reference before every commit (the mandatory 3-check gate)

---

### 6. Awesome Claude Skills — Reference Only (NOT installed)

| Property | Value |
|---|---|
| Source | github.com/ComposioHQ/awesome-claude-skills |
| License | Not confirmed |
| Adoption | **REFERENCE ONLY — NOT installed** |

**What it is:** A curated catalog of 25+ Claude skills including Composio
integrations, MCP builders, Slack/LinkedIn/invoice tools, webapp testing,
image enhancement, and more.

**Why not installed:** Many skills require external service credentials
(Composio, Slack, LangSmith), MCP servers, or introduce dependencies that
have not been audited for TecPey. The catalog is useful as a discovery
resource, not as a bulk installation.

**How to use:** If a specific skill from this catalog is needed, audit it
individually (license, deps, hooks, security) before adding it to
`.claude/skills/`.

---

## Hooks

**No hooks are installed in Phase 28.5.**

The project's existing `.claude/settings.local.json` is preserved untouched.
No new `hooks` entries were added.

If hooks are added in a future phase, they must be:
1. Reviewed as shell scripts line-by-line before installation
2. Confirmed safe to run on every session start or tool call
3. Listed here with their trigger event and effect
4. Added to git with a separate commit

---

## Rules for Adding Future Skills

1. **Audit first** — check license, hooks, dependencies, security risk
2. **Prefer reference adoption** — extract the SKILL.md guidance; don't install build tools
3. **Never install hooks without user approval** — session-level hooks run invisibly
4. **Never install npm dependencies as part of skill installation**
5. **Update this document** when a skill is added, deferred, or rejected
6. **Update CHANGELOG.md** with a Phase entry for the skill audit
7. **Run QA gate** after any skill installation that touches project files

### Skill Adoption Checklist

- [ ] License confirmed (MIT, Apache 2.0, ISC preferred)
- [ ] No hooks that run automatically
- [ ] No npm dependencies required
- [ ] No modification of project code
- [ ] SKILL.md adapted for TecPey conventions and constraints
- [ ] Documented in this file
- [ ] CHANGELOG.md updated
- [ ] QA gate passes (typecheck + lint + build)

---

## Update Process

Skills should be reviewed when:
- A new Claude Code version changes how skills are loaded
- The source repo releases a major update with new commands or breaking changes
- A skill's guidance becomes inconsistent with TecPey's evolving architecture

To update a skill:
1. Review the source repo diff
2. Update the `.claude/skills/<name>/SKILL.md`
3. Update this document's audit date
4. Commit: `docs: update <skill-name> skill to v<version>`

---

## Skills Not Considered in Phase 28.5

The following skill categories were intentionally excluded from this audit:

| Category | Reason |
|---|---|
| MCP servers | Require external service accounts; separate audit needed |
| Database management skills | TecPey uses its own migration runner |
| AI/LLM prompt skills | TecPey has a custom AI mentor architecture |
| Deployment/DevOps skills | CI is managed via GitHub Actions (already set up) |
| Testing framework skills | No test suite exists yet; will be scoped in a future phase |
