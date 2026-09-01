# News materialization resilience v1

This change separates observability status from process health for scheduled crypto-news materialization.

## Runtime contract

- Upstream feed degradation remains visible as `partial_failure` operational evidence and warning reason codes.
- The process may still exit `0` only when at least two international feeds produce usable input, both `en` and `fa` snapshots are persisted, the archive transaction commits, and operational evidence persists.
- Source quorum loss, missing required locale output, archive/database failures, state/evidence failures, and authority unavailability remain fail-closed.
- Feed retries are bounded to two attempts by default with bounded exponential backoff; retryable statuses include 408, 425, 429, 5xx, plus network/timeout failures.
- Empty but HTTP-successful feeds count as degraded sources rather than successful quorum members.

## Defaults

- `NEWS_FEED_MIN_SUCCESSFUL_SOURCES=2`
- `NEWS_FEED_MAX_ATTEMPTS=2`
- `NEWS_FEED_RETRY_BASE_DELAY_MS=350`

The environment checker validates all three knobs before the worker runs.

## Acceptance

Do not promote based on CI alone. Staging acceptance requires two consecutive automatic timer runs with distinct run IDs plus a controlled degraded-feed case demonstrating warning evidence with a healthy process exit when quorum and bilingual snapshots remain intact.
