# ESLint Correctness Authority

## Purpose

TecPey treats static correctness checks as release authority, not advisory
style feedback. `eslint.config.mjs` enforces the following rules as errors:

- `react-hooks/rules-of-hooks`
- `react-hooks/set-state-in-effect`
- `react-hooks/refs`
- `react-hooks/purity`
- `react-hooks/immutability`
- `@typescript-eslint/no-explicit-any`

Unused TypeScript bindings and unapproved raw image elements are also errors.
CI permits zero warnings.

## Zero-debt rules

Hook ordering, refs, purity, immutability and explicit `any` have no repository
baseline. Every finding in those categories blocks CI.

External payloads must enter as `unknown` or a narrow transport shape and be
validated before use. Financial, authentication, tenant, Admin, Wallet,
Withdrawal, Mentor and API boundaries must never recover convenience by adding
`any`.

## Reviewed legacy baseline

`config/eslint-correctness-baseline.json` is the human-reviewable authority for
the remaining `react-hooks/set-state-in-effect` debt. Every entry records:

- exact repository path, line and column;
- owning product/risk domain;
- the current reason the transition exists.

`eslint-suppressions.json` is the ESLint runtime projection of that inventory.
It contains only per-file counts for the same rule. Neither file is permission
to add another violation.

The authority check runs ESLint without the suppression projection and compares
the exact findings to the reviewed path/line baseline. Therefore:

- a new violation fails;
- an increased count fails;
- moving a finding without review fails;
- deleting or refactoring a finding requires pruning both records;
- changing the suppressed rule fails.

The baseline represents UI state-transition debt, not accepted architectural
quality. It must decrease in domain-sized batches, with interaction tests for
the affected hydration, request-loading or state-machine behavior.

## Inline exception policy

Inline exceptions remain visible to ESLint but must be:

1. limited to one line and the minimum rule set;
2. followed by `-- #<issue>: <precise reason>`;
3. unsuitable for replacement by a correct typed or React-safe implementation;
4. removed when the compatibility constraint ends.

File-level and global correctness-rule exceptions are prohibited. Generated
vendor bundles remain excluded only through the existing reviewed global ignore
paths.

## Permanent gates

Run:

```bash
npm run lint
npm run lint:authority
npm run test:lint-authority
npm run typecheck
```

The negative fixture tests prove that the production configuration rejects a
conditional hook call and a new explicit `any`. They also prove that an
unreasoned inline suppression and baseline growth are rejected.

CI runs the authority and negative tests immediately after zero-warning ESLint.
The full production build, runtime smoke and domain workflows remain independent
required evidence.
