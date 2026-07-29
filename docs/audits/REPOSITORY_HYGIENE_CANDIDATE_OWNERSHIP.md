# Repository hygiene candidate ownership

Issue [#26](https://github.com/tecpey/Tecpey-Os/issues/26) requires reference,
build, test, and product-ownership evidence before any apparently unreachable
file can be removed. Static import reachability is a candidate detector, not
deletion authority.

The exact candidate registry is
`config/repository-hygiene-candidate-ownership.json`. Each record is bound to
the reviewed file bytes with SHA-256 and includes an owning issue plus at least
two evidence statements.

## Current disposition

At baseline `main` commit
`109c6f927afe4709c5eecb714aa03162c761ff20`, the hygiene scanner reports 22
runtime-source candidates:

- 15 are **transitional** compatibility, replacement, or quarantined paths;
- 7 are **live/refactor-required** strategic or gated assets;
- 0 are **proven dead**;
- 0 are approved for deletion.

Important examples:

- the old Arena dashboard, scenario player, journal, and scenario data remain
  quarantined because they use browser-owned execution or progress state;
- the Instructor dashboard remains gated behind a deliberately fail-closed
  route until role, consent, tenant, and audit authority exist;
- Mentor cleanup has valid bounded PostgreSQL behavior but no governed
  scheduler;
- the older withdrawal gate is deprecated and compatibility-only while the
  canonical route uses PostgreSQL admission authority;
- several presentation and product-registry files have no current importer but
  belong to open product or platform work and cannot be deleted as junk.

## Permanent guard

`npm run audit:hygiene:candidates` regenerates the hygiene report and requires
an exact set match with the registry. It fails when:

- a new candidate is not classified;
- a stale classification remains after a path becomes reachable or is removed;
- reviewed file bytes change;
- the reviewed baseline is not an ancestor or its candidate bytes differ;
- a path is duplicated or the registry order drifts;
- owner/evidence fields are missing or contain duplicate claims;
- deletion is approved in this classification-only phase.

`npm run test:hygiene-candidates` provides negative tests for those bypasses.

Future removal work must first establish `proven-dead` evidence in a separate
review, then use a bounded deletion PR with reference search, production build,
runtime and product-owner evidence. This document and registry do not complete
Phase C or Issue #26.
