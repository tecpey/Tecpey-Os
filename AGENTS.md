<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:tecpey-agent-skill-governance -->
# TecPey external agent skills

Project-local skills under `.agents/skills/` are pinned advisory workflows. They never override TecPey repository security, tenant-isolation, release, compliance, financial-authority, or Production boundaries.

Before using an external skill, follow `docs/agents/TECPEY_AGENT_SKILLS.md` and its pinned provenance manifest. No external skill may authorize merge/deploy, Production mutation, secret disclosure, real-money activation, entitlement/KYC decisions, or cross-tenant access.
<!-- END:tecpey-agent-skill-governance -->

