# Repository Hygiene Report Schema

**Schema version:** 1  
**Producer:** `scripts/audit-repository-hygiene.mjs`

## Top-level fields

- `schemaVersion`: integer report contract version.
- `generatedAt`: ISO timestamp for the inventory run.
- `scope`: scanned file, source-file and detected-entrypoint counts.
- `warning`: mandatory statement that candidates are not deletion approval.
- `suspiciousArtifacts`: backup, temporary, editor and duplicate-name candidates.
- `zeroByteFiles`: tracked empty-file candidates.
- `largeFiles`: tracked files at or above the audit size threshold.
- `unreferencedDependencies`: declared packages with no detected direct import or script ownership.
- `orphanCandidates`: source files not reached from known application, server, script or test entrypoints.
- `duplicateBasenames`: repeated non-framework source basenames.
- `sourceMarkers`: counts for browser persistence, TODO, FIXME, HACK and legacy markers.
- `dependencyUsage`: declared dependency names with reference counts and owning files.

## Stability rule

Consumers must treat all candidate lists as informational. A schema field may identify review work, but only the evidence gates in `REPOSITORY_HYGIENE_METHOD.md` may authorize removal.

Breaking schema changes require a new integer schema version in this document and the producer output.
