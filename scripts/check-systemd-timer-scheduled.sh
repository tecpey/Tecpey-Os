#!/usr/bin/env bash
set -euo pipefail

TIMER_UNIT="${1:-}"
[[ -n "$TIMER_UNIT" ]] || { printf 'timer_unit_required\n' >&2; exit 1; }

TIMER_SUBSTATE="$(systemctl show "$TIMER_UNIT" --property=SubState --value)"
[[ "$TIMER_SUBSTATE" == "waiting" ]] || { printf 'timer_not_waiting\n' >&2; exit 1; }

TIMER_NEXT_MONOTONIC="$(systemctl show "$TIMER_UNIT" --property=NextElapseUSecMonotonic --value)"
[[ -n "$TIMER_NEXT_MONOTONIC" && "$TIMER_NEXT_MONOTONIC" != "infinity" ]] || {
  printf 'timer_next_elapse_missing\n' >&2
  exit 1
}

printf 'timer_schedule=valid\n'
