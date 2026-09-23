# TecPey agent issue / PR workflow

TecPey uses GitHub issues and pull requests as the implementation tracker.

## Authority

- Repository: `tecpey/Tecpey-Os`.
- Prefer the connected GitHub tooling when available.
- A `docs/program/*.md` contract linked from a Draft PR is an accepted spec source.
- Existing repository governance, decision logs and launch contracts outrank generic skill templates.

## Reading

Agents may inspect issues, PRs, reviews, commits, workflow runs and repository files needed to understand the work.

## Writing

- New implementation work should normally be scoped on a dedicated branch and Draft PR.
- Do not merge, deploy, close a non-superseded PR, delete branches, alter Production, or weaken a gate without explicit authority.
- Preserve exact-head evidence: when HEAD changes, prior CI is stale for release decisions.
- When a PR is superseded, document the replacement exact head / PR before closing it.
- Security-, money-, identity-, tenant- and entitlement-sensitive work must include negative/adversarial evidence.

## Specs and labels

The existing TecPey program-contract PR is the primary spec when present. Do not create a duplicate issue merely because a generic skill expects one. If a new GitHub issue is genuinely useful, use the repository's current labels rather than inventing a new taxonomy.

## Review

Review against:
1. the originating contract/issue/PR acceptance criteria; and
2. repository standards, security boundaries and governing docs.

Do not treat a green CI result as proof that the requested behavior or product truth is correct.
