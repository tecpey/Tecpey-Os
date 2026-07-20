# TecPey Documentation Governance

**Status:** Authoritative  
**Owner:** TecPey executive and engineering governance  
**Applies to:** All repository documentation, generated evidence, product specifications, architecture records, operational runbooks and AI-agent instructions  
**Review trigger:** Every material platform decision, authority-boundary change, launch-gate change or documentation conflict

## 1. Purpose

TecPey documentation is an engineering control, not promotional prose. It must allow a qualified reviewer, operator or future implementation team to distinguish:

- permanent product intent;
- binding governance and architecture decisions;
- verified current implementation;
- generated evidence from an exact commit;
- operational procedure;
- planned or aspirational capability;
- historical or superseded material.

No document may create production authority by assertion. Runtime behavior, schema, tests, operational evidence and approved release decisions remain the source of truth for implementation and readiness claims.

## 2. Authority hierarchy

When documents conflict, use the following order unless a higher document explicitly delegates authority.

1. **Constitution and executive governance**  
   `docs/TECPEY_CONSTITUTION.md` and accepted entries in the canonical decision log.
2. **Master product and platform intent**  
   `docs/TECPEY_MASTER_BLUEPRINT.md`.
3. **Release and implementation gates**  
   `docs/FINAL_IMPLEMENTATION_GATE.md` and dated launch/readiness records.
4. **Domain architecture and security standards**  
   Approved documents under `docs/architecture/`, `docs/security/`, `docs/academy/`, `docs/arena/` and equivalent governed domain directories.
5. **Operational runbooks and procedures**  
   Approved deployment, recovery, incident, migration and support runbooks.
6. **Generated exact-head evidence**  
   Machine-generated manifests, inventories and diagnostic artifacts tied to a cryptographic commit SHA.
7. **Living plans and task boards**  
   Active plans that coordinate work but do not override accepted architecture or release gates.
8. **Historical and superseded documents**  
   Retained for traceability and explicitly marked non-authoritative.

A lower-level document may provide more detail but may not weaken a higher-level invariant.

## 3. Document classes

Every material document must declare one class in its header.

### Authoritative

Binding product, governance, architecture, security or release policy. Changes require an explicit decision, owner and review evidence.

### Living

Actively maintained implementation, roadmap or operational content. It must state the date or commit of its current evidence and identify unresolved work.

### Generated evidence

Produced by deterministic tooling from an exact repository/runtime state. Generated evidence must identify:

- generator and schema version;
- exact commit or deployment identity;
- generation time or immutable source timestamp;
- denominator and exclusions;
- integrity digest where applicable.

Generated evidence must not be manually edited to hide findings.

### Runbook

Executable operational procedure. It must include prerequisites, authorization, rollback, verification, escalation and evidence-retention steps.

### Historical / superseded

Retained only for traceability. It must name the replacing document and must not appear in current required-reading lists unless historical context is explicitly needed.

## 4. Required document metadata

Material documents should include:

- title;
- status and document class;
- owner;
- last reviewed date;
- exact evidence commit or deployment when describing implementation;
- scope and exclusions;
- related decisions/issues/PRs;
- supersedes / superseded-by relationship;
- review trigger.

Dated completion percentages, readiness scores and security claims must name their scoring method and evidence date. They must never appear as timeless status badges.

## 5. Verified reality versus roadmap

Documents must use explicit language:

- **Implemented** — code/schema exists and required verification passed.
- **Verified** — evidence is tied to an exact commit or deployment and required gates passed.
- **Gated / disabled** — implementation may exist but production use is blocked by policy or missing evidence.
- **In progress** — active work exists but acceptance criteria are incomplete.
- **Planned / roadmap** — intended capability with no implementation claim.
- **Historical / superseded** — not current authority.

Words such as production-ready, secure, compliant, complete, enterprise-grade or certified require named evidence and approving authority.

## 6. Single-source and non-duplication rules

- One document owns each permanent decision or normative requirement.
- Other documents link to the authority rather than copying large sections.
- A summary may restate a rule only when it identifies the authoritative source and does not alter meaning.
- Generated manifests are referenced, not copied into multiple hand-maintained documents.
- Domain documents must not redefine platform-wide identity, tenant, persistence, financial or release invariants.
- README is an entry point and public engineering contract, not the deepest authority for every domain.

When duplication is discovered, retain the strongest canonical source, replace duplicates with links or historical markers, and preserve Git history.

## 7. Decision governance

Difficult-to-reverse product, architecture, security, data, compliance, vendor, custody or operational decisions require an accepted decision-log entry.

A decision entry must include:

- stable identifier;
- status;
- date and owner;
- decision and scope;
- context and problem;
- alternatives considered;
- rationale;
- consequences and trade-offs;
- security, privacy, financial and operational impact;
- implementation and migration requirements;
- revisit conditions;
- related evidence and documents.

A decision is not silently edited after acceptance. Material changes use a superseding entry that links to the original.

## 8. AI-agent and automated-tool rules

AI agents and automated documentation tools must:

- read the authority hierarchy before modifying critical documents;
- identify the exact source files and evidence used;
- distinguish observed fact from inference and proposal;
- preserve NO-GO and residual-risk language unless closing evidence exists;
- avoid creating duplicate master plans, constitutions or decision logs;
- never publish secrets, PII, custody material or exploitable private details;
- not mark work complete because prose was generated;
- update links and required-reading lists when authority changes;
- keep generated diagnostics out of `main` unless the artifact is intentionally governed source evidence.

## 9. Review and change process

1. Identify the authoritative document and affected decisions.
2. Open or reference the governing issue/PR.
3. State whether the change is product intent, verified implementation, generated evidence, runbook or roadmap.
4. Update the smallest authoritative set of documents.
5. Validate relative links, referenced commands and paths.
6. Reconcile conflicts and mark superseded material.
7. Run applicable documentation/QA checks.
8. Review the final diff for overstatement, stale status and accidental sensitive data.
9. Merge only with exact-head required checks and resolved review threads.

## 10. Required-reading orders

### Critical implementation change

1. `docs/TECPEY_CONSTITUTION.md`
2. this document
3. `docs/governance/TECPEY_DECISION_LOG.md`
4. `docs/TECPEY_MASTER_BLUEPRINT.md`
5. `docs/FINAL_IMPLEMENTATION_GATE.md`
6. relevant domain architecture/security standard
7. current issue, PR and exact-head evidence

### Release decision

1. Constitution and accepted decisions
2. Final Implementation Gate
3. dated completion/readiness baseline
4. domain release gates
5. migration, test, runtime, security and recovery evidence
6. residual-risk and rollback record

## 11. Current canonical references

- Constitution: `docs/TECPEY_CONSTITUTION.md`
- Master blueprint: `docs/TECPEY_MASTER_BLUEPRINT.md`
- Final implementation gate: `docs/FINAL_IMPLEMENTATION_GATE.md`
- Canonical decision-log index: `docs/governance/TECPEY_DECISION_LOG.md`
- Historical decision registry currently retained at: `docs/DECISION_LOG.md`
- Backend authority map: `docs/architecture/TECPEY_BACKEND_AUTHORITY_MAP.md`
- Repository QA program: `docs/qa/REPOSITORY_LINE_BY_LINE_QA_PROGRAM.md`

## 12. Enforcement

A documentation change fails governance when it:

- contradicts a higher authority without a superseding decision;
- presents roadmap as implemented;
- removes a release blocker without evidence;
- publishes a readiness claim without date and denominator;
- introduces broken required-reading links;
- duplicates a canonical normative source;
- hides unresolved P0/P1 findings;
- includes secrets, private user data or custody material.

Documentation governance is complete only when the repository, runtime behavior and release evidence tell the same story.