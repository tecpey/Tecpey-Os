#!/usr/bin/env bash
set -euo pipefail

readonly HOST_DEPLOYMENT_RETIRED=1
echo "Retired: repository-owned privileged host bootstrap is not an approved production authority." >&2
echo "Use the immutable digest-pinned Docker Compose release path documented in DEPLOY_UBUNTU_24_PRODUCTION.md." >&2
exit "$HOST_DEPLOYMENT_RETIRED"
