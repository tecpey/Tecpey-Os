# Protected incident environment parser fix — 2026-09-16

## Failure observed
Protected Staging Incident Readiness Evidence reached the protected staging runner and passed exact authority/runtime/participant validation, then failed at `Configure governed alert CA trust` with `protected_incident_environment_file_format_invalid`.

## Root cause
The workflow accepted only strict `KEY=value` lines with no assignment whitespace, `export` prefix, or quoted values. The staging environment file is runtime-valid but can use safe dotenv-compatible assignment syntax outside that narrower grammar.

## Fix contract
The parser now accepts optional `export`, whitespace around `=`, and balanced single/double quoted values. It remains fail-closed for empty values, duplicate keys, invalid key names, and unquoted whitespace. Existing file safety, absolute path, permissions, required-variable, CA-file and X.509 validation remain unchanged.

No staging environment file, secret, database, systemd unit, application runtime, or production resource is changed by this patch.
