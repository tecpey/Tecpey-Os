#!/usr/bin/env bash
set -euo pipefail

readonly HOST_DEPLOYMENT_RETIRED=1
echo "Retired: PM2 host deployment is not an approved TecPey production release path." >&2
echo "Use the immutable digest-pinned Docker Compose release path documented in DEPLOY_UBUNTU_24_PRODUCTION.md." >&2
exit "$HOST_DEPLOYMENT_RETIRED"
