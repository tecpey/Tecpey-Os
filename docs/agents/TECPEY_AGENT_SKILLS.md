# TecPey Agent Skills Governance

TecPey vendors a small, reviewable set of project-local agent skills under `.agents/skills/`.
They are pinned to immutable upstream commits and must remain subordinate to TecPey repository governance.

## Authority order

1. System/platform safety and tool rules.
2. Explicit user authorization for the current task.
3. TecPey repository governance, security, release, tenant and production boundaries.
4. Installed agent skill instructions.

An external skill **cannot** authorize merge, deployment, production mutation, secret disclosure, credential use,
real-money activation, entitlement changes, KYC/compliance decisions, or cross-tenant access. Those actions remain
governed by TecPey's existing authorities and explicit approvals.

**No skill may authorize merge/deploy** or weaken an existing TecPey gate.

## Curated set

| Skill | Source | Why TecPey installs it |
| --- | --- | --- |
| `vercel-react-best-practices` | `vercel-labs/agent-skills` | React/Next performance, server/client boundaries, bundle and rendering discipline. |
| `vercel-composition-patterns` | `vercel-labs/agent-skills` | Reduces boolean-prop sprawl and improves reusable React architecture. |
| `frontend-design` | `anthropics/skills` | Distinctive, intentional UI design instead of generic AI-generated visual patterns. |
| `webapp-testing` | `anthropics/skills` | Browser-level Playwright workflows with a bundled local-server helper. |
| `systematic-debugging` | `obra/superpowers` | Root-cause-first debugging, feedback loops and defense-in-depth debugging. |
| `verification-before-completion` | `obra/superpowers` | Prevents completion claims without fresh verification evidence. |
| `security-review` | `github/awesome-copilot` | High-confidence exploitable code-security review with structured references. |
| `security-threat-model` | `openai/skills` | Repository-grounded trust-boundary, abuse-path and mitigation modeling. |
| `postgresql-code-review` | `github/awesome-copilot` | PostgreSQL/RLS/schema/index/security review relevant to TecPey's tenant-heavy backend. |

Exact source paths, licenses and pinned commits live in
`docs/agents/tecpey-agent-skills.json`.

## Deliberate exclusions

- **`next-best-practices`** — registry result currently does not match the present
  `vercel-labs/next-skills` source tree, so it is not vendored until source provenance is consistent.
- **`web-design-guidelines`** — useful, but the current source repository does not expose a repository license
  through GitHub metadata and the skill itself has no explicit license declaration; TecPey does not vendor
  ambiguous third-party content.
- **`agent-browser`** — high-quality browser automation, but the skill requires a separate CLI/browser binary.
  TecPey already has governed browser golden-path infrastructure; this is reconsidered only when the required
  runtime can be installed/pinned/reproduced in CI.
- **`agent-owasp-compliance`** — excluded after current-source validation: the pinned upstream skill labels a custom ASI-01…ASI-10 taxonomy as the OWASP 2026 Top 10. TecPey does not vendor a security/compliance skill whose normative mapping is not current-source accurate.
- **`find-skills`** — excluded because its upstream workflow recommends mutable discovery plus optional global, non-pinned installation. Future skill discovery remains a deliberate review task under this policy, not an installed execution authority.
- Broad, low-reputation or duplicate skills are not installed merely because they rank highly.

## Third-party helper execution boundary

Vendored helper scripts are **source-pinned references**, not trusted shell authority. They are stored non-executable. In particular, Anthropic's upstream `webapp-testing/scripts/with_server.py` intentionally accepts a developer-supplied server command and uses a shell so it can support `cd ... && ...` workflows.

For TecPey:
- never pass user-, web-, model-, file- or issue-derived untrusted strings into a vendored helper command;
- only run a helper with an already-reviewed local development command whose arguments are known;
- do not use vendored helpers for Production/Staging mutation, credentialed network actions or protected release workflows;
- prefer TecPey's existing Playwright/evidence workflows for governed browser acceptance;
- an external helper's ability to execute a command never grants permission to execute that command.

## Update policy

Skill updates are dependency updates:

1. discover a candidate version;
2. inspect upstream diff and security-audit status;
3. pin an exact upstream commit;
4. copy the complete files required by the skill;
5. update `tecpey-agent-skills.json`;
6. run `node --test scripts/agent-skills-authority.test.mjs`;
7. review in PR like any other supply-chain change.

No `@latest`, floating branch, hidden network bootstrap, or automatic unreviewed skill update is accepted. Every vendored required file is additionally locked to its exact upstream Git blob.

## Runtime/use policy

- Skills provide procedural guidance; they do not replace repository-specific docs or exact current framework docs.
- Next.js work must still honor the root `AGENTS.md` rule to consult the installed Next.js documentation when APIs may have changed.
- Security skills are complementary: threat modeling and code-security review are separate activities. Agentic-AI risk assessment must use current primary OWASP/NIST guidance rather than a stale vendored taxonomy.
- UI skills must follow TecPey's actual brand, FA/EN parity, accessibility and product-truth contracts.
- Testing/debugging skills may create local evidence but may not weaken tests, bypass protected environments or redact failures.
