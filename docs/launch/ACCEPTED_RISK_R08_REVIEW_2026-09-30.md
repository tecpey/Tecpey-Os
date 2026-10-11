# R-08 accountable review — 2026-09-30

**Status: project-owner cadence review confirmed in the 2026-09-30 conversation; independent Growth Lead sign-off and operating measurements remain outstanding.** This is not acceptance of NOG-08, a Go decision, or a claim of below-threshold traffic.

## Current authority

- The controlled-launch register in `docs/LAUNCH_ACCEPTED_RISKS.md` allows Persian-first copy while gating English and global growth claims. Non-Persian weekly active users above 10%, or non-Persian qualified commercial leads above 5% in a rolling seven-day window, make English parity and discoverability blocking for growth campaigns.
- The prescribed response is to pause non-Persian acquisition and remove global readiness claims until parity evidence is accepted. The last R-08 accountable review was 2026-09-14; its next deadline was 2026-09-28.
- FA and EN are active runtime locales in `src/i18n/config.ts`; this does not by itself prove complete English content, legal, accessibility or discoverability parity. CRM lead records have a locale field, but that alone does not establish qualified-lead counts or a complete seven-day denominator.

## Evidence still required

| Measure | Required evidence | Current verified value |
|---|---|---|
| Non-Persian weekly active users / all weekly active users | Deduplicated user counts, event definition, locale attribution, rolling seven-day window, source and query/run identity | Not supplied or verified in this review |
| Non-Persian qualified commercial leads / all qualified commercial leads | Qualification rule, deduplicated lead counts, locale attribution, rolling seven-day window, source and query/run identity | Not supplied or verified in this review |
| Acquisition and global claims | Current campaign inventory, targeting, landing copy and owner confirmation of pause/claim controls | Not supplied or verified in this review |
| English parity and discoverability | Reviewed route/content matrix, legal and accessibility checks, canonical/hreflang/schema evidence tied to the candidate SHA | Not established by locale activation alone |

An absent measurement, a zero denominator or an unknown locale must not be reported as a passing percentage. Until the measures and campaign controls are verified, retain the growth restriction and do not assert that the thresholds are below their limits.

## Accountable disposition

The project owner confirmed maintaining the Persian-first controlled-launch decision, 10% and 5% triggers, and the pause/removal response on 2026-09-30. Keep non-Persian acquisition and global readiness claims gated while measurement and parity evidence above is missing. The register sets the next biweekly review deadline to 2026-10-14. Do not relabel historical candidate-bound sign-offs or treat this cadence review as NOG-08 acceptance.

**Outstanding:** Growth Lead concurrence, measured denominators/numerators, campaign inventory, and independent English parity evidence have not been supplied. Any launch or growth decision depending on these remains blocked.
