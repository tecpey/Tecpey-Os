# API Security Manifest Bootstrap

This branch bootstraps the exhaustive mutating-route inventory required by issue #108.

The temporary bootstrap workflow generates `api-security-manifest.generated.json` from every `src/app/api/**/route.ts` export of `POST`, `PUT`, `PATCH`, or `DELETE` and uploads it as a short-lived workflow artifact.

Before merge, the temporary workflow and this bootstrap note must be removed. The generated inventory will be committed under the permanent security-governance path, checked for deterministic drift in the main CI workflow, and paired with explicit time-bounded exceptions for any existing control debt.
