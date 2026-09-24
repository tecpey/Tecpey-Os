# Third-party notices — TecPey Agent Skills Pack

The files under `.agents/skills/` are vendored project-level agent instructions. They are not runtime application dependencies and do not execute in TecPey production by being present in the repository.

| Installed skill | Upstream | Pinned source | License evidence |
| --- | --- | --- | --- |
| vercel-react-best-practices | vercel-labs/agent-skills | `063bee94c3f4df8453406c830b0a7df0f2860278` | `SKILL.md` metadata declares MIT |
| vercel-composition-patterns | vercel-labs/agent-skills | `063bee94c3f4df8453406c830b0a7df0f2860278` | `SKILL.md` metadata declares MIT |
| web-design-guidelines | vercel-labs/agent-skills | `063bee94c3f4df8453406c830b0a7df0f2860278` | upstream skill metadata/source; no repository-root LICENSE file was present at the pinned revision |
| frontend-design | anthropics/skills | `34040c9c568585f6929bedeaad110ad08f079624` | Apache-2.0; preserved beside the skill |
| security-review | github/awesome-copilot | `d7e4ad98ed8fd72e4744ee604e6277eb36748fe2` | MIT; preserved beside the skill |
| agent-browser | vercel-labs/agent-browser | `d01253d9db28d75080e36da3c1c31ef89454731e` | Apache-2.0; preserved beside the skill |
| diagnosing-bugs | mattpocock/skills | `c55ee46073ed923f86ce59a5eb3b6d895095d1b7` | MIT; preserved beside the skill |
| postgres-best-practices | neondatabase/postgres-skills | `27fe45e0f71ea89a6eaf9ea4d2e4068957c81c26` | Apache-2.0; preserved beside the skill |

## Update rule

Upstream content is pinned intentionally. Updating a skill requires reviewing the diff from the old pinned commit to the proposed new commit, rechecking license evidence, updating `.agents/skills/tecpey-sources.json`, and passing `npm run agent-skills:verify`.

TecPey's repository policy, security boundaries, user approvals, release governance and product authorities always override generic third-party skill instructions.
