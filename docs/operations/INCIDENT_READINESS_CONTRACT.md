# Incident Readiness Contract

This contract defines the minimum incident ownership, alert acknowledgement and
support evidence required before a controlled Soft Launch Go decision can be
recorded.

It does not authorize production real-money Exchange, custody, deposits,
withdrawals, public rewards, enterprise or white-label activation.

## Controlled-launch coverage

| Field | Required value |
|---|---|
| Support window | 09:00-23:00 Asia/Tehran, every day during controlled launch |
| Incident commander | Founder/CEO or delegated release owner |
| Technical owner | CTO or Chief Architect |
| SRE owner | SRE Lead |
| Security owner | Chief Security Officer or DevSecOps Lead |
| Product owner | CPO or Academy Director for user-facing Academy/Mentor/Arena incidents |

## Severity and acknowledgement targets

| Severity | Examples | Acknowledgement target | Launch action |
|---|---|---|---|
| P0 | Database unavailable, Redis unavailable with degraded user impact, migration failure, critical alert delivery failure, cross-tenant visibility, real-money surface accidentally enabled | 15 minutes during support hours; 60 minutes outside support hours | Freeze launch expansion; incident commander owns Go/No-Go disposition |
| P1 | Academy canonical progress degradation, Mentor persistence failure, Golden Path regression, operational scheduler failure, alert quarantine growth | 4 hours | Keep controlled cohort capped until disposition is recorded |
| P2 | Non-critical copy drift, localized UX defect, non-blocking analytics/reporting issue | 2 business days | Track to next controlled-launch review |

## Required evidence before Go

The Go packet must attach redacted evidence proving:

- protected staging synthetic critical alert delivery succeeds twice;
- alert delivery latency is under five minutes for both probes;
- pending alert count is zero;
- quarantine count is zero;
- P0 acknowledgement drill is recorded by incident commander and SRE owner;
- DB, Redis, migration, alert-delivery, worker and reconciliation failure
  runbooks identify the first responder, escalation path, rollback/halt
  condition and user-communication owner;
- evidence contains no raw secrets, host IPs, customer rows, provider payloads
  or private logs.

If any item is missing, the launch decision remains NO-GO.

## User communication boundary

Controlled-launch users must be told that support is available during the
declared support window and that real-money Exchange, custody, deposits,
withdrawals and public rewards are not part of the controlled launch.

No README, landing page, in-app copy, investor update or release note may imply
24/7 production support or real-money operational readiness until a later
contract explicitly supersedes this document.
