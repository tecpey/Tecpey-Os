# TecPey Repository Hygiene Method

**Status:** Authoritative cleanup method  
**Related:** #26

## Purpose

Repository cleanup must reduce ambiguity, attack surface, build weight and maintenance cost without deleting live product behavior or concealing incomplete work.

No file or dependency is removable merely because its name contains `legacy`, because code search returns no result, or because a page is not currently linked in navigation.

## Automated inventory

Run:

```bash
npm run audit:hygiene
```

For structured output:

```bash
npm run audit:hygiene:json
```

The inventory scans the repository while excluding generated/build directories and reports:

- backup/editor/temporary artifact names;
- zero-byte and unusually large files;
- declared dependencies with no detected direct imports or script ownership;
- source files not reachable from known Next.js, server, script or test entrypoints;
- duplicate non-framework basenames;
- browser-persistence, TODO, FIXME, HACK and legacy marker counts;
- detected dependency-to-file ownership.

### CI evidence

Every CI run executes a separate `Repository Hygiene Inventory` job. It publishes a structured JSON artifact retained for 14 days, allowing candidate counts and ownership evidence to be reviewed without mixing the report into Build/Test logs.

The artifact is evidence input only. It is not committed to the repository and does not authorize automatic deletion.

## Classification

Every candidate must be assigned one class before action:

### A. Proven dead

All of the following are true:

- no static or dynamic import/reference;
- no framework convention or runtime discovery ownership;
- no deployment, migration, operational or external integration dependency;
- no data-recovery or historical migration role;
- removal passes TypeScript, ESLint, all authority guards, tests and production Build;
- relevant runtime smoke path remains healthy.

Only this class may be deleted.

### B. Transitional

The file or dependency supports migration, compatibility, rollback or data recovery. It must remain with:

- named owner;
- removal condition;
- expiry/review date or measurable migration gate;
- telemetry or evidence proving when it is safe to retire.

### C. Live but requires refactor

The capability is used but may be duplicated, oversized, poorly named or architecturally misplaced. It must be refactored through a focused PR rather than deleted.

### D. Unresolved ownership

Evidence is incomplete. The candidate remains untouched until ownership is proven.

## Dependency-removal gate

A package may be removed only after:

1. direct imports and dynamic imports are absent;
2. package scripts/config files do not invoke it;
3. framework/plugin/transpiler ownership is ruled out;
4. lockfile is regenerated with the governed npm version;
5. exact-head CI passes;
6. production Build and relevant runtime path pass;
7. bundle or install impact is recorded.

The automated `unreferencedDependencies` list is a manual-review queue, not an uninstall command.

## Source-file deletion gate

An unreachable-source candidate is not automatically dead. Before deletion review:

- inspect route conventions and metadata loaders;
- inspect string-based dynamic imports and registries;
- inspect tests, scripts, workers and deployment references;
- inspect compatibility and user-data migration paths;
- identify replacement authority when duplicate generations exist;
- prove no rollback requirement remains.

## Safe PR size

Cleanup should be shipped in small groups:

- one clearly related dependency family;
- one obsolete feature generation after replacement verification;
- one temporary/artifact class;
- one documentation/governance normalization group.

Do not mix cleanup with financial logic, migration rewrites or unrelated UI redesign.

## Required evidence in every cleanup PR

- candidate inventory;
- ownership search results;
- reason each item is safe to remove;
- before/after file or dependency count;
- exact-head CI result;
- Build result;
- affected smoke paths;
- rollback strategy when deletion is not trivially reversible.

## Current policy

The audit runs in CI as an informational inventory. It does not fail the build on candidates because false positives must be manually classified first. Once an artifact class is proven universally invalid, a focused permanent failing guard may be introduced.
