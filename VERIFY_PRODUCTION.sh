#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec bash scripts/ubuntu24-preflight.sh "$@"
