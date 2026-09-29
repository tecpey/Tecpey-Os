# Stop conditions

Stop and keep the PR Draft if any required exact-head check fails, the registry plan is inconsistent, the migration is non-idempotent, the PostgreSQL race proof fails, main materially drifts, or the PR becomes superseded. Never infer readiness from earlier green SHAs.
