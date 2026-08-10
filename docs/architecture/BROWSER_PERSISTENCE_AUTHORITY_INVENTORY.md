# Browser Persistence Authority Inventory

Status: launch hardening guard

`localStorage`, `sessionStorage`, IndexedDB and browser cache storage are never TecPey source-of-truth authorities. They may appear only as classified disposable projections, repairable offline transport, or one-shot legacy migration helpers.

## Current Governed Inventory

The authoritative command is:

```bash
npm run browser:persistence:check
```

Current result on `main` after PR #353:

| Metric | Value |
| --- | ---: |
| Classified production matching lines | 25 |
| Production files with classified browser persistence | 7 |
| Quarantined legacy authority modules | 0 |
| Protected Community journal/challenge surfaces with browser persistence | 0 |

The wider repository hygiene scan reports raw marker counts across code, docs and tests. Those counts are useful for visibility, but they are not the authority inventory. The authority inventory is the fail-closed allowlist in `scripts/check-browser-persistence.mjs`.

## Allowed Classes

| Class | Meaning |
| --- | --- |
| `disposable-ui-cache` | Reconstructible UI memory only; not official progress, score, trade, journal or eligibility evidence. |
| `one-shot-legacy-migration` | Temporary import helper that sends old browser data to a server authority and then stops treating the browser as truth. |
| `repairable-offline-projection` | Offline transport/projection that must surface write failure and reconcile with backend APIs. |

`quarantined-legacy-authority` is retired. Reintroducing it is a release-blocking architecture regression.

## Release Gate

`release:check` now includes `browser:persistence:check`, and CI runs the same npm command. A new browser persistence usage must therefore either remove an existing line, fit an existing classified count, or be reviewed as a server-authority migration before it can merge.